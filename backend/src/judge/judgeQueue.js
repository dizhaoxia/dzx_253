const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('../config/db');

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

      let containerName, imageName, runCmd;
      const containerId = uuidv4().substring(0, 12);

      if (language === 'cpp') {
        const sourcePath = path.join(tempDir, 'main.cpp');
        fs.writeFileSync(sourcePath, code);
        containerName = `oj-cpp-${containerId}`;
        imageName = 'gcc:latest';
        runCmd = `g++ -o /app/main /app/main.cpp && /app/main < /app/input.txt > /app/output.txt`;
      } else if (language === 'python') {
        const sourcePath = path.join(tempDir, 'main.py');
        fs.writeFileSync(sourcePath, code);
        containerName = `oj-python-${containerId}`;
        imageName = 'python:3.9-slim';
        runCmd = `python /app/main.py < /app/input.txt > /app/output.txt`;
      } else {
        throw new Error('Unsupported language');
      }

      const dockerCmd = `docker run --rm --name ${containerName} -v "${tempDir}":/app -w /app ${imageName} sh -c "${runCmd}"`;
      console.log('Running docker command:', dockerCmd);

      const startTime = Date.now();
      const result = await new Promise((resolve) => {
        exec(dockerCmd, { timeout: 10000 }, (error, stdout, stderr) => {
          const endTime = Date.now();
          const timeUsed = endTime - startTime;
          const output = fs.existsSync(outputPath) ? fs.readFileSync(outputPath, 'utf8') : '';
          resolve({ error, stdout, stderr, output, timeUsed });
        });
      });

      let status;
      if (result.error) {
        status = 'Runtime Error';
      } else {
        const expectedOutput = problem.sample_output.trim();
        const actualOutput = result.output.trim();
        status = expectedOutput === actualOutput ? 'Accepted' : 'Wrong Answer';
      }

      await pool.execute(
        'UPDATE submissions SET status = ?, time_used = ? WHERE id = ?',
        [status, result.timeUsed, id]
      );

      return { id, status, time_used: result.timeUsed };
    } catch (error) {
      console.error('Judge error:', error);
      await pool.execute('UPDATE submissions SET status = ? WHERE id = ?', ['Judge Error', id]);
      return { id, status: 'Judge Error', time_used: 0 };
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  }
}

const judgeQueue = new JudgeQueue();
module.exports = judgeQueue;
