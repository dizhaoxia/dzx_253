const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'oj_platform',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

const initDatabase = async () => {
  try {
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'root',
      password: process.env.DB_PASSWORD || '123456'
    });

    await connection.execute(`CREATE DATABASE IF NOT EXISTS oj_platform`);
    await connection.end();

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS problems (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        description TEXT NOT NULL,
        input_format TEXT NOT NULL,
        output_format TEXT NOT NULL,
        time_limit INT DEFAULT 1000,
        memory_limit INT DEFAULT 128,
        sample_input TEXT NOT NULL,
        sample_output TEXT NOT NULL,
        test_case_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);

    const addColumnsIfNotExist = async (tableName, columnDefinitions) => {
      for (const def of columnDefinitions) {
        try {
          await pool.execute(`ALTER TABLE ${tableName} ADD COLUMN ${def}`);
        } catch (e) {
          if (!e.code || e.code !== 'ER_DUP_FIELDNAME') {
            console.log(`Migration note for ${tableName}: ${e.message}`);
          }
        }
      }
    };

    await addColumnsIfNotExist('problems', [
      'test_case_count INT DEFAULT 0'
    ]);

    await addColumnsIfNotExist('submissions', [
      'score INT DEFAULT 0',
      'error_message TEXT'
    ]);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS submissions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        problem_id INT NOT NULL,
        code TEXT NOT NULL,
        language VARCHAR(20) NOT NULL,
        status VARCHAR(50) DEFAULT 'Pending',
        score INT DEFAULT 0,
        time_used INT DEFAULT 0,
        memory_used INT DEFAULT 0,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id),
        FOREIGN KEY (problem_id) REFERENCES problems(id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS test_cases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        problem_id INT NOT NULL,
        test_case_number INT NOT NULL,
        input_text LONGTEXT,
        expected_output LONGTEXT,
        is_sample TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (problem_id) REFERENCES problems(id) ON DELETE CASCADE,
        UNIQUE KEY unique_problem_testcase (problem_id, test_case_number)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS submission_test_cases (
        id INT AUTO_INCREMENT PRIMARY KEY,
        submission_id INT NOT NULL,
        test_case_id INT NOT NULL,
        test_case_number INT NOT NULL,
        status VARCHAR(20) NOT NULL,
        time_used INT DEFAULT 0,
        memory_used INT DEFAULT 0,
        actual_output LONGTEXT,
        error_message TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (submission_id) REFERENCES submissions(id) ON DELETE CASCADE,
        FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_code VARCHAR(6) UNIQUE NOT NULL,
        name VARCHAR(100) NOT NULL,
        creator_id INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (creator_id) REFERENCES users(id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS room_members (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        user_id INT NOT NULL,
        joined_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_room_user (room_id, user_id)
      )
    `);

    await pool.execute(`
      CREATE TABLE IF NOT EXISTS room_messages (
        id INT AUTO_INCREMENT PRIMARY KEY,
        room_id INT NOT NULL,
        user_id INT NOT NULL,
        username VARCHAR(50) NOT NULL,
        type VARCHAR(20) DEFAULT 'chat',
        content TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization failed:', error);
    process.exit(1);
  }
};

module.exports = { pool, initDatabase };
