-- Migration: Add track_duration column to posts table
-- Date: 2024-01-XX
-- Description: Adds track_duration column to store track duration in seconds
DO $ $ BEGIN IF NOT EXISTS (
    SELECT
        1
    FROM
        information_schema.columns
    WHERE
        table_name = 'posts'
        AND column_name = 'track_duration'
) THEN
ALTER TABLE
    posts
ADD
    COLUMN track_duration INTEGER;

RAISE NOTICE 'Added track_duration column to posts table';

END IF;

END $ $;