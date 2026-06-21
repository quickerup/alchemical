ALTER TABLE ai_butlers ADD COLUMN history_json TEXT DEFAULT '[]';
ALTER TABLE ai_butlers ADD COLUMN updated_at INTEGER;
