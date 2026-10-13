-- Each style note's meaning as a vector, so notes can be searched by
-- similarity to a request. Same size as Item.embedding. Null until embedded.
ALTER TABLE "StyleNote" ADD COLUMN "embedding" vector(768);