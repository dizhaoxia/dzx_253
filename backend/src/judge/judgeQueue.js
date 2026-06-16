const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

const execAsync = (cmd, options = {}) => {
  return new Promise((resolve) => {
    exec(cmd, options, (error, stdout, stderr) => {
      resolve({ error, stdout, stderr });
    });
  });
};

let dockerAvailable = null;
const pulledImages = new Set();

const checkDocker = async () => {
  if (dockerAvailable !== null) return dockerAvailable;
  try {
    const { error } = await execAsync('docker info', { timeout: 5000 });
    dockerAvailable = !error;
    if (dockerAvailable) {
      console.log('Docker is available for judging');
    } else {
      console.log('Docker not available, using local execution for judging');
    }
  } catch {
    dockerAvailable = false;
    console.log('Docker not available, using local execution for judging');
  }
  return dockerAvailable;
};

const ensureDockerImage = async (imageName) => {
  if (pulledImages.has(imageName)) return true;
  try {
    const { error } = await execAsync(`docker image inspect ${imageName}`, { timeout: 5000 });
    if (!error) {
      pulledImages.add(imageName);
      return true;
    }
  } catch {}

  console.log(`Pulling Docker image ${imageName}...`);
  const pullResult = await execAsync(`docker pull ${imageName}`, { timeout: 300000 });
  if (pullResult.error) {
    console.error(`Failed to pull ${imageName}:`, pullResult.stderr);
    return false;
  }
  console.log(`Successfully pulled ${imageName}`);
  pulledImages.add(imageName);
  return true;
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
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

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
      await pool.execute('UPDATE submissions SET status = ? WHERE id = ?', ['Judging', id]);

      const [problems] = await pool.execute('SELECT sample_input, sample_output FROM problems WHERE id = ?', [problem_id]);
      if (problems.length === 0) {
        throw new Error('Problem not found');
      }
      const problem = problems[0];

      const inputPath = path.join(tempDir, 'input.txt');
      const outputPath = path.join(tempDir, 'output.txt');
      fs.writeFileSync(inputPath, problem.sample_input);

      let runCmd;
      let useDockerExec = false;
      const useDocker = await checkDocker();

      if (language === 'cpp') {
        const sourcePath = path.join(tempDir, 'main.cpp');
        fs.writeFileSync(sourcePath, code);
        if (useDocker) {
          const imageReady = await ensureDockerImage('gcc:latest');
          if (imageReady) {
            useDockerExec = true;
            const containerId = uuidv4().substring(0, 12);
            runCmd = `docker run --rm --name oj-cpp-${containerId} -v "${tempDir}":/app -w /app gcc:latest sh -c "g++ -o /app/main /app/main.cpp && /app/main < /app/input.txt > /app/output.txt"`;
          }
        }
        if (!useDockerExec) {
          const exePath = path.join(tempDir, 'main');
          runCmd = `g++ -o "${exePath}" "${sourcePath}" && "${exePath}" < "${inputPath}" > "${outputPath}"`;
        }
      } else if (language === 'python') {
        const sourcePath = path.join(tempDir, 'main.py');
        fs.writeFileSync(sourcePath, code);
        if (useDocker) {
          const imageReady = await ensureDockerImage('python:3.9-slim');
          if (imageReady) {
            useDockerExec = true;
            const containerId = uuidv4().substring(0, 12);
            runCmd = `docker run --rm --name oj-python-${containerId} -v "${tempDir}":/app -w /app python:3.9-slim sh -c "python /app/main.py < /app/input.txt > /app/output.txt"`;
          }
        }
        if (!useDockerExec) {
          runCmd = `python3 "${sourcePath}" < "${inputPath}" > "${outputPath}"`;
        }
      } else {
        throw new Error('Unsupported language');
      }

      const execMode = useDockerExec ? 'Docker' : 'Local';
      console.log(`[Judge #${id}] ${execMode} execution: ${language}`);

      const startTime = Date.now();
      const result = await new Promise((resolve) => {
        exec(runCmd, { timeout: 30000 }, (error, stdout, stderr) => {
          const endTime = Date.now();
          const timeUsed = endTime - startTime;
          let output = '';
          try {
            if (fs.existsSync(outputPath)) {
              output = fs.readFileSync(outputPath, 'utf8');
            }
          } catch {}
          resolve({ error, stdout, stderr, output, timeUsed });
        });
      });

      let status;
      if (result.error) {
        if (result.error.killed) {
          status = 'Time Limit Exceeded';
          console.log(`[Judge #${id}] TLE (${result.timeUsed}ms)`);
        } else {
          status = 'Runtime Error';
          console.log(`[Judge #${id}] RE (${result.timeUsed}ms): ${(result.stderr || '').substring(0, 200)}`);
        }
      } else {
        const expectedOutput = problem.sample_output.trim();
        const actualOutput = result.output.trim();
        if (expectedOutput === actualOutput) {
          status = 'Accepted';
          console.log(`[Judge #${id}] AC (${result.timeUsed}ms)`);
        } else {
          status = 'Wrong Answer';
          console.log(`[Judge #${id}] WA (${result.timeUsed}ms) expected="${expectedOutput}" got="${actualOutput}"`);
        }
      }

      await pool.execute(
        'UPDATE submissions SET status = ?, time_used = ? WHERE id = ?',
        [status, result.timeUsed, id]
      );

      return { id, status, time_used: result.timeUsed };
    } catch (error) {
      console.error(`[Judge #${id}] Error:`, error.message);
      await pool.execute('UPDATE submissions SET status = ? WHERE id = ?', ['Judge Error', id]);
      return { id, status: 'Judge Error', time_used: 0 };
    } finally {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}

const judgeQueue = new JudgeQueue();
module.exports = judgeQueue;
