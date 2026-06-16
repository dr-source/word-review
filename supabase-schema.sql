-- 单词复习系统 - Supabase 数据库表结构
-- 在 Supabase → SQL Editor 中执行

CREATE TABLE IF NOT EXISTS books (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS words (
  id BIGSERIAL PRIMARY KEY,
  book_id BIGINT REFERENCES books(id) ON DELETE CASCADE,
  word TEXT NOT NULL,
  phonetic TEXT DEFAULT '',
  mean TEXT DEFAULT '',
  sentence TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 允许公开读写（学习工具，不需要用户登录）
ALTER TABLE books ENABLE ROW LEVEL SECURITY;
ALTER TABLE words ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "公开读 books" ON books;
DROP POLICY IF EXISTS "公开写 books" ON books;
DROP POLICY IF EXISTS "公开删 books" ON books;
CREATE POLICY "公开读 books" ON books FOR SELECT USING (true);
CREATE POLICY "公开写 books" ON books FOR INSERT WITH CHECK (true);
CREATE POLICY "公开删 books" ON books FOR DELETE USING (true);

DROP POLICY IF EXISTS "公开读 words" ON words;
DROP POLICY IF EXISTS "公开写 words" ON words;
DROP POLICY IF EXISTS "公开改 words" ON words;
DROP POLICY IF EXISTS "公开删 words" ON words;
CREATE POLICY "公开读 words" ON words FOR SELECT USING (true);
CREATE POLICY "公开写 words" ON words FOR INSERT WITH CHECK (true);
CREATE POLICY "公开改 words" ON words FOR UPDATE USING (true);
CREATE POLICY "公开删 words" ON words FOR DELETE USING (true);
