const express = require('express');
const multer = require('multer');
const AdmZip = require('adm-zip');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { pool } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

const updateTestCaseCount = async (problemId) => {
  const [countResult] = await pool.execute(
    'SELECT COUNT(*) as cnt FROM test_cases WHERE problem_id = ?',
    [problemId]
  );
  await pool.execute(
    'UPDATE problems SET test_case_count = ? WHERE id = ?',
    [countResult[0].cnt, problemId]
  );
  return countResult[0].cnt;
};

const migrateSampleToTestCase = async (problem) => {
  if (!problem.sample_input || !problem.sample_output) return;
  const [existing] = await pool.execute(
    'SELECT id FROM test_cases WHERE problem_id = ? AND test_case_number = 1',
    [problem.id]
  );
  if (existing.length === 0) {
    await pool.execute(
      'INSERT INTO test_cases (problem_id, test_case_number, input_text, expected_output, is_sample) VALUES (?, ?, ?, ?, ?)',
      [problem.id, 1, problem.sample_input, problem.sample_output, 1]
    );
    await updateTestCaseCount(problem.id);
  }
};

router.get('/', async (req, res) => {
  try {
    const [problems] = await pool.execute(
      'SELECT id, title, description, input_format, output_format, time_limit, memory_limit, sample_input, sample_output, test_case_count, created_at FROM problems ORDER BY id DESC'
    );
    res.json(problems);
  } catch (error) {
    console.error('Get problems error:', error);
    res.status(500).json({ error: 'Failed to get problems' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const [problems] = await pool.execute(
      'SELECT id, title, description, input_format, output_format, time_limit, memory_limit, sample_input, sample_output, test_case_count, created_at FROM problems WHERE id = ?',
      [id]
    );

    if (problems.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    await migrateSampleToTestCase(problems[0]);

    const [testCases] = await pool.execute(
      'SELECT id, test_case_number, input_text, expected_output, is_sample FROM test_cases WHERE problem_id = ? ORDER BY test_case_number ASC',
      [id]
    );

    res.json({
      ...problems[0],
      test_cases: testCases
    });
  } catch (error) {
    console.error('Get problem error:', error);
    res.status(500).json({ error: 'Failed to get problem' });
  }
});

router.get('/:id/test-cases', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const [testCases] = await pool.execute(
      'SELECT id, test_case_number, input_text, expected_output, is_sample, created_at FROM test_cases WHERE problem_id = ? ORDER BY test_case_number ASC',
      [id]
    );
    res.json(testCases);
  } catch (error) {
    console.error('Get test cases error:', error);
    res.status(500).json({ error: 'Failed to get test cases' });
  }
});

router.post('/', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { title, description, input_format, output_format, time_limit, memory_limit, sample_input, sample_output } = req.body;

    if (!title || !description || !input_format || !output_format || !sample_input || !sample_output) {
      return res.status(400).json({ error: 'All fields are required' });
    }

    const [result] = await pool.execute(
      'INSERT INTO problems (title, description, input_format, output_format, time_limit, memory_limit, sample_input, sample_output) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [title, description, input_format, output_format, time_limit || 1000, memory_limit || 128, sample_input, sample_output]
    );

    const problemId = result.insertId;
    await pool.execute(
      'INSERT INTO test_cases (problem_id, test_case_number, input_text, expected_output, is_sample) VALUES (?, ?, ?, ?, ?)',
      [problemId, 1, sample_input, sample_output, 1]
    );
    await updateTestCaseCount(problemId);

    res.status(201).json({
      id: problemId,
      title,
      description,
      input_format,
      output_format,
      time_limit: time_limit || 1000,
      memory_limit: memory_limit || 128,
      sample_input,
      sample_output,
      test_case_count: 1
    });
  } catch (error) {
    console.error('Create problem error:', error);
    res.status(500).json({ error: 'Failed to create problem' });
  }
});

router.post('/:id/test-cases', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { input_text, expected_output, is_sample } = req.body;

    const [existing] = await pool.execute('SELECT id FROM problems WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const [maxResult] = await pool.execute(
      'SELECT COALESCE(MAX(test_case_number), 0) as max_num FROM test_cases WHERE problem_id = ?',
      [id]
    );
    const nextNumber = maxResult[0].max_num + 1;

    const [result] = await pool.execute(
      'INSERT INTO test_cases (problem_id, test_case_number, input_text, expected_output, is_sample) VALUES (?, ?, ?, ?, ?)',
      [id, nextNumber, input_text || '', expected_output || '', is_sample ? 1 : 0]
    );

    await updateTestCaseCount(id);

    res.status(201).json({
      id: result.insertId,
      problem_id: parseInt(id),
      test_case_number: nextNumber,
      input_text,
      expected_output,
      is_sample: is_sample ? 1 : 0
    });
  } catch (error) {
    console.error('Add test case error:', error);
    res.status(500).json({ error: 'Failed to add test case' });
  }
});

router.put('/:id/test-cases/:testCaseId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id, testCaseId } = req.params;
    const { input_text, expected_output, is_sample } = req.body;

    const [existing] = await pool.execute(
      'SELECT id FROM test_cases WHERE id = ? AND problem_id = ?',
      [testCaseId, id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    const fields = [];
    const values = [];

    if (input_text !== undefined) { fields.push('input_text = ?'); values.push(input_text); }
    if (expected_output !== undefined) { fields.push('expected_output = ?'); values.push(expected_output); }
    if (is_sample !== undefined) { fields.push('is_sample = ?'); values.push(is_sample ? 1 : 0); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(testCaseId);
    await pool.execute(`UPDATE test_cases SET ${fields.join(', ')} WHERE id = ?`, values);

    const [updated] = await pool.execute('SELECT * FROM test_cases WHERE id = ?', [testCaseId]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Update test case error:', error);
    res.status(500).json({ error: 'Failed to update test case' });
  }
});

router.delete('/:id/test-cases/:testCaseId', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id, testCaseId } = req.params;

    const [existing] = await pool.execute(
      'SELECT id FROM test_cases WHERE id = ? AND problem_id = ?',
      [testCaseId, id]
    );
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Test case not found' });
    }

    await pool.execute('DELETE FROM test_cases WHERE id = ?', [testCaseId]);
    await updateTestCaseCount(id);

    res.json({ message: 'Test case deleted successfully' });
  } catch (error) {
    console.error('Delete test case error:', error);
    res.status(500).json({ error: 'Failed to delete test case' });
  }
});

router.post('/:id/import-testcases', authenticateToken, requireAdmin, upload.single('file'), async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.execute('SELECT id FROM problems WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const zip = new AdmZip(req.file.buffer);
    const zipEntries = zip.getEntries();

    const inputMap = new Map();
    const outputMap = new Map();

    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      const name = path.basename(entry.entryName);
      const match = name.match(/^(\d+)\.(in|out|txt|ans|input|output)$/i);
      if (match) {
        const num = parseInt(match[1]);
        const ext = match[2].toLowerCase();
        const content = entry.getData().toString('utf8');
        if (['in', 'input', 'txt'].includes(ext) && !inputMap.has(num)) {
          inputMap.set(num, content);
        }
        if (['out', 'output', 'ans'].includes(ext) && !outputMap.has(num)) {
          outputMap.set(num, content);
        }
      }
    }

    const inPattern = /^input(\d+)\.txt$/i;
    const outPattern = /^output(\d+)\.txt$/i;
    for (const entry of zipEntries) {
      if (entry.isDirectory) continue;
      const name = path.basename(entry.entryName);
      let match = name.match(inPattern);
      if (match) {
        const num = parseInt(match[1]);
        if (!inputMap.has(num)) {
          inputMap.set(num, entry.getData().toString('utf8'));
        }
        continue;
      }
      match = name.match(outPattern);
      if (match) {
        const num = parseInt(match[1]);
        if (!outputMap.has(num)) {
          outputMap.set(num, entry.getData().toString('utf8'));
        }
      }
    }

    const numbers = new Set([...inputMap.keys(), ...outputMap.keys()]);
    const sortedNumbers = [...numbers].sort((a, b) => a - b);

    if (sortedNumbers.length === 0) {
      return res.status(400).json({ error: 'No valid test case files found in ZIP. Expected files like 1.in/1.out or input1.txt/output1.txt' });
    }

    if (sortedNumbers.length > 100) {
      return res.status(400).json({ error: 'Too many test cases. Maximum is 100.' });
    }

    const [maxResult] = await pool.execute(
      'SELECT COALESCE(MAX(test_case_number), 0) as max_num FROM test_cases WHERE problem_id = ?',
      [id]
    );
    let nextNumber = maxResult[0].max_num + 1;

    const imported = [];
    for (const num of sortedNumbers) {
      const input = inputMap.get(num) || '';
      const output = outputMap.get(num) || '';
      if (input && output) {
        const [result] = await pool.execute(
          'INSERT INTO test_cases (problem_id, test_case_number, input_text, expected_output, is_sample) VALUES (?, ?, ?, ?, ?)',
          [id, nextNumber, input, output, nextNumber === 1 ? 1 : 0]
        );
        imported.push({
          id: result.insertId,
          test_case_number: nextNumber,
          original_number: num
        });
        nextNumber++;
      }
    }

    const totalCount = await updateTestCaseCount(id);

    res.json({
      message: `Successfully imported ${imported.length} test cases`,
      imported_count: imported.length,
      total_test_cases: totalCount,
      imported
    });
  } catch (error) {
    console.error('Import test cases error:', error);
    res.status(500).json({ error: 'Failed to import test cases: ' + error.message });
  }
});

router.put('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, input_format, output_format, time_limit, memory_limit, sample_input, sample_output } = req.body;

    const [existing] = await pool.execute('SELECT id FROM problems WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    const fields = [];
    const values = [];

    if (title !== undefined) { fields.push('title = ?'); values.push(title); }
    if (description !== undefined) { fields.push('description = ?'); values.push(description); }
    if (input_format !== undefined) { fields.push('input_format = ?'); values.push(input_format); }
    if (output_format !== undefined) { fields.push('output_format = ?'); values.push(output_format); }
    if (time_limit !== undefined) { fields.push('time_limit = ?'); values.push(time_limit); }
    if (memory_limit !== undefined) { fields.push('memory_limit = ?'); values.push(memory_limit); }
    if (sample_input !== undefined) { fields.push('sample_input = ?'); values.push(sample_input); }
    if (sample_output !== undefined) { fields.push('sample_output = ?'); values.push(sample_output); }

    if (fields.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    values.push(id);
    await pool.execute(`UPDATE problems SET ${fields.join(', ')} WHERE id = ?`, values);

    if (sample_input !== undefined || sample_output !== undefined) {
      const [prob] = await pool.execute('SELECT sample_input, sample_output FROM problems WHERE id = ?', [id]);
      if (prob.length > 0) {
        const [sampleTC] = await pool.execute(
          'SELECT id FROM test_cases WHERE problem_id = ? AND test_case_number = 1',
          [id]
        );
        if (sampleTC.length > 0) {
          await pool.execute(
            'UPDATE test_cases SET input_text = ?, expected_output = ? WHERE id = ?',
            [sample_input ?? prob[0].sample_input, sample_output ?? prob[0].sample_output, sampleTC[0].id]
          );
        }
      }
    }

    const [updated] = await pool.execute('SELECT * FROM problems WHERE id = ?', [id]);
    res.json(updated[0]);
  } catch (error) {
    console.error('Update problem error:', error);
    res.status(500).json({ error: 'Failed to update problem' });
  }
});

router.delete('/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;

    const [existing] = await pool.execute('SELECT id FROM problems WHERE id = ?', [id]);
    if (existing.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    await pool.execute('DELETE FROM problems WHERE id = ?', [id]);

    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    console.error('Delete problem error:', error);
    res.status(500).json({ error: 'Failed to delete problem' });
  }
});

module.exports = router;
