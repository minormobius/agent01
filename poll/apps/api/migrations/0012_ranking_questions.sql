-- Add question_type column to survey_questions
-- Defaults to 'single_choice' for backward compatibility
ALTER TABLE survey_questions ADD COLUMN question_type TEXT NOT NULL DEFAULT 'single_choice';
