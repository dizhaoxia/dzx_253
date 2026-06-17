const Docker = require('dockerode');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');
const { getSocketManager } = require('../realTime/socketManager');
const { delCache } = require('../config/redis');
const { plagiarismDetector } = require('../services/plagiarismDetector');

const JUDGE_STATUS = {
  AC: 'AC',
  WA: 'WA',
  CE: 'CE',
  RE: 'RE',
  TLE: 'TLE',
  MLE: 'MLE',
  PE: 'PE',
  PENDING: 'Pending',
  JUDGING: 'Judging',
  ERROR: 'Judge Error'
};

const STATUS_DISPLAY = {
  AC: 'Accepted',
  WA: 'Wrong Answer',
  CE: 'Compile Error',
  RE: 'Runtime Error',
  TLE: 'Time Limit Exceeded',
  MLE: 'Memory Limit Exceeded',
  PE: 'Presentation Error',
  Pending: 'Pending',
  Judging: 'Judging',
  'Judge Error': 'Judge Error'
};

let docker = null;
let dockerAvailable = false;
const pulledImages = new Set();

const initDocker = () => {
  try {
    docker = new Docker();
    dockerAvailable = true;
    console.log('Dockerode initialized successfully');
  } catch (error) {
    console.error('Failed to initialize Dockerode:', error.message);
    dockerAvailable = false;
  }
};

initDocker();

const checkDocker = async () => {
  if (!docker) return false;
  try {
    await docker.ping();
    return true;
  } catch {
    return false;
  }
};

const ensureDockerImage = async (imageName) => {
  if (pulledImages.has(imageName)) return true;
  if (!docker) return false;

  try {
    const images = await docker.listImages({ filters: { reference: [imageName] } });
    if (images.length > 0) {
      pulledImages.add(imageName);
      return true;
    }
  } catch {}

  try {
    console.log(`Pulling Docker image ${imageName}...`);
    await new Promise((resolve, reject) => {
      docker.pull(imageName, (err, stream) => {
        if (err) return reject(err);
        docker.modem.followProgress(stream, (err) => {
          if (err) reject(err);
          else resolve();
        });
      });
    });
    pulledImages.add(imageName);
    console.log(`Successfully pulled ${imageName}`);
    return true;
  } catch (error) {
    console.error(`Failed to pull ${imageName}:`, error.message);
    return false;
  }
};

const normalizeOutput = (text) => {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
};

const checkPresentationError = (expected, actual) => {
  const expectedNorm = normalizeOutput(expected);
  const actualNorm = normalizeOutput(actual);
  if (expectedNorm === actualNorm) return false;

  const expectedTokens = expectedNorm.split(/\s+/).filter(t => t.length > 0);
  const actualTokens = actualNorm.split(/\s+/).filter(t => t.length > 0);
  return JSON.stringify(expectedTokens) === JSON.stringify(actualTokens);
};

const compileWithDocker = async (language, code, tempDir) => {
  const result = { success: false, errorMessage: '', binaryPath: '' };

  if (language === 'cpp') {
    const sourcePath = path.join(tempDir, 'main.cpp');
    fs.writeFileSync(sourcePath, code);
    const binaryPath = path.join(tempDir, 'main');

    if (dockerAvailable && await checkDocker() && await ensureDockerImage('gcc:latest')) {
      try {
        const container = await docker.createContainer({
          Image: 'gcc:latest',
          Cmd: ['sh', '-c', 'g++ -o /app/main /app/main.cpp 2>&1'],
          HostConfig: {
            Binds: [`${tempDir}:/app`],
            MemoryLimit: 512 * 1024 * 1024,
            CpuQuota: 100000,
            NetworkMode: 'none'
          },
          WorkingDir: '/app'
        });

        await container.start();
        const waitResult = await container.wait();
        const logs = await container.logs({ stdout: true, stderr: true, follow: false });
        const logStr = logs.toString('utf8');

        try {
          await container.remove({ force: true });
        } catch {}

        if (waitResult.StatusCode === 0 && fs.existsSync(binaryPath)) {
          result.success = true;
          result.binaryPath = binaryPath;
        } else {
          result.success = false;
          result.errorMessage = logStr.substring(0, 2000);
        }
      } catch (error) {
        result.errorMessage = 'Docker compilation failed: ' + error.message.substring(0, 500);
      }
    } else {
      const { execSync } = require('child_process');
      try {
        execSync(`g++ -o "${binaryPath}" "${sourcePath}"`, { timeout: 30000, stdio: 'pipe' });
        if (fs.existsSync(binaryPath)) {
          result.success = true;
          result.binaryPath = binaryPath;
        }
      } catch (error) {
        result.success = false;
        result.errorMessage = (error.stderr ? error.stderr.toString() : error.message).substring(0, 2000);
      }
    }
  } else if (language === 'python') {
    result.success = true;
    const sourcePath = path.join(tempDir, 'main.py');
    fs.writeFileSync(sourcePath, code);
    result.binaryPath = sourcePath;
  }

  return result;
};

const runTestCaseWithDocker = async (language, binaryPath, inputText, expectedOutput, timeLimitMs, memoryLimitMB, tempDir) => {
  const result = {
    status: JUDGE_STATUS.WA,
    time_used: 0,
    memory_used: 0,
    actual_output: '',
    error_message: ''
  };

  const inputPath = path.join(tempDir, `input_${uuidv4().substring(0, 8)}.txt`);
  const outputPath = path.join(tempDir, `output_${uuidv4().substring(0, 8)}.txt`);
  fs.writeFileSync(inputPath, inputText);

  const startTime = Date.now();
  let cmd = '';
  let imageName = '';
  let memoryLimitBytes = memoryLimitMB * 1024 * 1024;

  if (language === 'cpp') {
    imageName = 'gcc:latest';
    cmd = `/app/${path.basename(binaryPath)} < /app/${path.basename(inputPath)} > /app/${path.basename(outputPath)} 2>&1`;
  } else if (language === 'python') {
    imageName = 'python:3.9-slim';
    cmd = `python /app/${path.basename(binaryPath)} < /app/${path.basename(inputPath)} > /app/${path.basename(outputPath)} 2>&1`;
  }

  let container = null;
  let timedOut = false;
  let memExceeded = false;

  try {
    if (dockerAvailable && await checkDocker() && await ensureDockerImage(imageName)) {
      container = await docker.createContainer({
        Image: imageName,
        Cmd: ['sh', '-c', cmd],
        HostConfig: {
          Binds: [`${tempDir}:/app`],
          MemoryLimit: memoryLimitBytes,
          MemorySwap: memoryLimitBytes,
          CpuQuota: 100000,
          NetworkMode: 'none'
        },
        WorkingDir: '/app'
      });

      await container.start();

      const timeoutPromise = new Promise((resolve) => {
        setTimeout(() => { timedOut = true; resolve({ timeout: true }); }, timeLimitMs + 500);
      });

      const waitPromise = container.wait();

      const raceResult = await Promise.race([waitPromise, timeoutPromise]);

      if (raceResult && raceResult.timeout) {
        try {
          await container.kill();
        } catch {}
        try {
          await container.remove({ force: true });
        } catch {}
        result.status = JUDGE_STATUS.TLE;
        result.time_used = timeLimitMs;
        return result;
      }

      const waitResult = raceResult;
      const endTime = Date.now();
      result.time_used = Math.min(endTime - startTime, timeLimitMs);

      try {
        const stats = await container.stats({ stream: false });
        if (stats && stats.memory_stats && stats.memory_stats.usage) {
          result.memory_used = Math.round(stats.memory_stats.usage / (1024 * 1024));
          if (result.memory_used > memoryLimitMB) {
            memExceeded = true;
          }
        }
      } catch {}

      try {
        await container.remove({ force: true });
      } catch {}

      if (memExceeded) {
        result.status = JUDGE_STATUS.MLE;
        return result;
      }

      if (fs.existsSync(outputPath)) {
        result.actual_output = fs.readFileSync(outputPath, 'utf8');
      }

      if (waitResult.StatusCode !== 0) {
        result.status = JUDGE_STATUS.RE;
        const logs = result.actual_output || '';
        result.error_message = logs.substring(0, 500);
        return result;
      }
    } else {
      const { exec } = require('child_process');
      await new Promise((resolve) => {
        exec(cmd, { timeout: timeLimitMs, maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
          const endTime = Date.now();
          result.time_used = Math.min(endTime - startTime, timeLimitMs);

          if (error) {
            if (error.killed) {
              result.status = JUDGE_STATUS.TLE;
              result.time_used = timeLimitMs;
            } else {
              result.status = JUDGE_STATUS.RE;
              result.error_message = (stderr || error.message).substring(0, 500);
            }
          }
          if (fs.existsSync(outputPath)) {
            result.actual_output = fs.readFileSync(outputPath, 'utf8');
          }
          resolve();
        });
      });

      if (result.status === JUDGE_STATUS.TLE || result.status === JUDGE_STATUS.RE) {
        return result;
      }
    }

    const expectedNorm = normalizeOutput(expectedOutput);
    const actualNorm = normalizeOutput(result.actual_output);

    if (expectedNorm === actualNorm) {
      result.status = JUDGE_STATUS.AC;
    } else if (checkPresentationError(expectedOutput, result.actual_output)) {
      result.status = JUDGE_STATUS.PE;
    } else {
      result.status = JUDGE_STATUS.WA;
    }

  } catch (error) {
    result.status = JUDGE_STATUS.RE;
    result.error_message = error.message.substring(0, 500);
    if (container) {
      try { await container.kill(); } catch {}
      try { await container.remove({ force: true }); } catch {}
    }
  } finally {
    try { if (fs.existsSync(inputPath)) fs.unlinkSync(inputPath); } catch {}
    try { if (fs.existsSync(outputPath)) fs.unlinkSync(outputPath); } catch {}
  }

  return result;
};

class JudgeQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
  }

  add(submission) {
    return new Promise((resolve, reject) => {
      this.queue.push({ submission, resolve, reject });
      this.processQueue();
    });
  }

  async processQueue() {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    const { submission, resolve, reject } = this.queue.shift();

    try {
      const result = await this.judge(submission);
      resolve(result);
    } catch (error) {
      reject(error);
    } finally {
      this.isProcessing = false;
      this.processQueue();
    }
  }

  async judge(submission) {
    const { id, user_id, problem_id, code, language } = submission;
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oj-'));

    try {
      await pool.execute('UPDATE submissions SET status = ? WHERE id = ?', [JUDGE_STATUS.JUDGING, id]);

      const [problems] = await pool.execute(
        'SELECT * FROM problems WHERE id = ?',
        [problem_id]
      );
      if (problems.length === 0) {
        throw new Error('Problem not found');
      }
      const problem = problems[0];

      let [testCases] = await pool.execute(
        'SELECT * FROM test_cases WHERE problem_id = ? ORDER BY test_case_number ASC',
        [problem_id]
      );

      if (testCases.length === 0) {
        await pool.execute(
          'INSERT INTO test_cases (problem_id, test_case_number, input_text, expected_output, is_sample) VALUES (?, ?, ?, ?, ?)',
          [problem_id, 1, problem.sample_input, problem.sample_output, 1]
        );
        [testCases] = await pool.execute(
          'SELECT * FROM test_cases WHERE problem_id = ? ORDER BY test_case_number ASC',
          [problem_id]
        );
      }

      const compileResult = await compileWithDocker(language, code, tempDir);
      if (!compileResult.success) {
        await pool.execute(
          'UPDATE submissions SET status = ?, score = ?, error_message = ? WHERE id = ?',
          [JUDGE_STATUS.CE, 0, compileResult.errorMessage, id]
        );

        const socketManager = getSocketManager();
        if (socketManager) {
          socketManager.sendToUser(user_id, 'submission_updated', {
            submission_id: id,
            status: JUDGE_STATUS.CE,
            score: 0,
            display_status: STATUS_DISPLAY[JUDGE_STATUS.CE]
          });
        }

        return { id, status: JUDGE_STATUS.CE, score: 0, display_status: STATUS_DISPLAY[JUDGE_STATUS.CE] };
      }

      const testCaseResults = [];
      let acCount = 0;
      let maxTime = 0;
      let maxMemory = 0;
      let overallStatus = JUDGE_STATUS.AC;

      for (const tc of testCases) {
        const tcResult = await runTestCaseWithDocker(
          language,
          compileResult.binaryPath,
          tc.input_text,
          tc.expected_output,
          problem.time_limit,
          problem.memory_limit,
          tempDir
        );

        tcResult.test_case_id = tc.id;
        tcResult.test_case_number = tc.test_case_number;
        testCaseResults.push(tcResult);

        maxTime = Math.max(maxTime, tcResult.time_used);
        maxMemory = Math.max(maxMemory, tcResult.memory_used);

        if (tcResult.status === JUDGE_STATUS.AC) {
          acCount++;
        } else if (overallStatus === JUDGE_STATUS.AC) {
          overallStatus = tcResult.status;
        }

        await pool.execute(
          `INSERT INTO submission_test_cases 
           (submission_id, test_case_id, test_case_number, status, time_used, memory_used, actual_output, error_message) 
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            tc.id,
            tc.test_case_number,
            tcResult.status,
            tcResult.time_used,
            tcResult.memory_used,
            tcResult.actual_output ? tcResult.actual_output.substring(0, 5000) : '',
            tcResult.error_message || ''
          ]
        );
      }

      const score = testCases.length > 0 ? Math.round((acCount / testCases.length) * 100) : 0;

      let finalStatus;
      if (acCount === testCases.length) {
        finalStatus = JUDGE_STATUS.AC;
      } else if (acCount === 0) {
        finalStatus = overallStatus;
      } else {
        finalStatus = overallStatus;
      }

      await pool.execute(
        'UPDATE submissions SET status = ?, score = ?, time_used = ?, memory_used = ? WHERE id = ?',
        [finalStatus, score, maxTime, maxMemory, id]
      );

      const socketManager = getSocketManager();
      if (socketManager) {
        socketManager.sendToUser(user_id, 'submission_updated', {
          submission_id: id,
          status: finalStatus,
          score,
          time_used: maxTime,
          memory_used: maxMemory,
          display_status: STATUS_DISPLAY[finalStatus],
          test_case_results: testCaseResults.map(r => ({
            test_case_number: r.test_case_number,
            status: r.status,
            time_used: r.time_used,
            memory_used: r.memory_used,
            display_status: STATUS_DISPLAY[r.status]
          }))
        });

        if (finalStatus === JUDGE_STATUS.AC) {
          const [users] = await pool.execute('SELECT username FROM users WHERE id = ?', [user_id]);
          const username = users.length > 0 ? users[0].username : 'Unknown';

          const [existingAc] = await pool.execute(
            `SELECT COUNT(*) as cnt FROM submissions 
             WHERE user_id = ? AND problem_id = ? AND status = ?`,
            [user_id, problem_id, JUDGE_STATUS.AC]
          );

          if (existingAc[0].cnt <= 1) {
            const [userRooms] = await pool.execute(
              `SELECT r.room_code 
               FROM room_members rm 
               INNER JOIN rooms r ON rm.room_id = r.id 
               WHERE rm.user_id = ?`,
              [user_id]
            );

            socketManager.broadcastSolvedProblem(
              user_id,
              username,
              problem_id,
              problem.title
            );

            for (const room of userRooms) {
              socketManager.broadcastSolvedProblem(
                user_id,
                username,
                problem_id,
                problem.title,
                room.room_code
              );
            }
          }

          await delCache('rankings:all');
          socketManager.broadcastToAll('rankings_updated', {});

          plagiarismDetector.processAcceptedSubmission(
            id,
            user_id,
            problem_id,
            code,
            language
          ).catch(err => {
            console.error(`[Plagiarism #${id}] Error:`, err.message);
          });

          const [submissionRoom] = await pool.execute(
            'SELECT room_id, is_competition_submission FROM submissions WHERE id = ?',
            [id]
          );

          if (submissionRoom.length > 0 && submissionRoom[0].room_id && submissionRoom[0].is_competition_submission) {
            const roomId = submissionRoom[0].room_id;
            const [rooms] = await pool.execute(
              'SELECT id, room_code, status FROM rooms WHERE id = ?',
              [roomId]
            );

            if (rooms.length > 0 && rooms[0].status === 'running') {
              const [memberStats] = await pool.execute(`
                SELECT 
                  COUNT(DISTINCT CASE WHEN s.status = 'AC' THEN s.problem_id END) as solved_count,
                  COALESCE(SUM(CASE WHEN s.status = 'AC' THEN 
                    TIMESTAMPDIFF(SECOND, r.start_time, s.created_at)
                  END), 0) as total_time,
                  MAX(CASE WHEN s.status = 'AC' THEN s.created_at END) as last_ac_time
                FROM submissions s
                INNER JOIN rooms r ON s.room_id = r.id
                WHERE s.user_id = ? 
                  AND s.room_id = ? 
                  AND s.is_competition_submission = 1
                  AND s.created_at BETWEEN r.start_time AND r.end_time
              `, [user_id, roomId]);

              if (memberStats.length > 0) {
                const stats = memberStats[0];
                const solvedCount = stats.solved_count || 0;
                const totalTime = stats.total_time || 0;
                const lastAcTime = stats.last_ac_time;

                const score = solvedCount * 1000 - Math.floor(totalTime / 60);

                await pool.execute(`
                  UPDATE room_members 
                  SET solved_count = ?, total_time = ?, last_ac_time = ?, competition_score = ?
                  WHERE room_id = ? AND user_id = ?
                `, [solvedCount, totalTime, lastAcTime, Math.max(0, score), roomId, user_id]);

                const [rankings] = await pool.execute(`
                  SELECT 
                    rm.user_id,
                    u.username,
                    rm.solved_count,
                    rm.total_time,
                    rm.competition_score,
                    rm.last_ac_time
                  FROM room_members rm
                  LEFT JOIN users u ON rm.user_id = u.id
                  WHERE rm.room_id = ?
                  ORDER BY rm.competition_score DESC, rm.last_ac_time ASC
                `, [roomId]);

                socketManager.broadcastToRoom(rooms[0].room_code, 'competition_rankings_updated', {
                  room_code: rooms[0].room_code,
                  rankings
                });
              }
            }
          }
        }
      }

      console.log(`[Judge #${id}] ${finalStatus} (${acCount}/${testCases.length}, score: ${score})`);
      return {
        id,
        status: finalStatus,
        score,
        time_used: maxTime,
        memory_used: maxMemory,
        display_status: STATUS_DISPLAY[finalStatus],
        test_case_results: testCaseResults
      };

    } catch (error) {
      console.error(`[Judge #${id}] Error:`, error.message);
      await pool.execute('UPDATE submissions SET status = ? WHERE id = ?', [JUDGE_STATUS.ERROR, id]);

      const socketManager = getSocketManager();
      if (socketManager) {
        socketManager.sendToUser(user_id, 'submission_updated', {
          submission_id: id,
          status: JUDGE_STATUS.ERROR,
          display_status: STATUS_DISPLAY[JUDGE_STATUS.ERROR]
        });
      }

      return { id, status: JUDGE_STATUS.ERROR, display_status: STATUS_DISPLAY[JUDGE_STATUS.ERROR] };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

const judgeQueue = new JudgeQueue();
module.exports = { judgeQueue, JUDGE_STATUS, STATUS_DISPLAY };
