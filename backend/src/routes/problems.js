const express = require('express');
const { pool } = require('../config/db');
const { authenticateToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const [problems] = await pool.execute(
      'SELECT id, title, description, input_format, output_format, time_limit, memory_limit, sample_input, sample_output, created_at FROM problems ORDER BY id DESC'
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
      'SELECT id, title, description, input_format, output_format, time_limit, memory_limit, sample_input, sample_output, created_at FROM problems WHERE id = ?',
      [id]
    );

    if (problems.length === 0) {
      return res.status(404).json({ error: 'Problem not found' });
    }

    res.json(problems[0]);
  } catch (error) {
    console.error('Get problem error:', error);
    res.status(500).json({ error: 'Failed to get problem' });
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

    res.status(201).json({
      id: result.insertId,
      title,
      description,
      input_format,
      output_format,
      time_limit: time_limit || 1000,
      memory_limit: memory_limit || 128,
      sample_input,
      sample_output
    });
  } catch (error) {
    console.error('Create problem error:', error);
    res.status(500).json({ error: 'Failed to create problem' });
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

    await pool.execute('DELETE FROM submissions WHERE problem_id = ?', [id]);
    await pool.execute('DELETE FROM problems WHERE id = ?', [id]);

    res.json({ message: 'Problem deleted successfully' });
  } catch (error) {
    console.error('Delete problem error:', error);
    res.status(500).json({ error: 'Failed to delete problem' });
  }
});

module.exports = router;
