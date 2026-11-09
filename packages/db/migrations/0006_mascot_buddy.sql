-- Contract v0.4: Mascot = { buddy } (Desk Buddies). Additive data migration of the old {species,palette,accessory,seed} shape.
-- Mapping: fox->blu, cat->pip (cat+scarf->milo), owl->sage, bear->mocha, blob->fern, bot->milo, anything else -> a buddy picked from the seed.
UPDATE members SET mascot = jsonb_build_object('buddy',
  CASE
    WHEN mascot ? 'buddy' THEN mascot->>'buddy'
    WHEN mascot->>'species' = 'fox' THEN 'blu'
    WHEN mascot->>'species' = 'cat' AND mascot->>'accessory' = 'scarf' THEN 'milo'
    WHEN mascot->>'species' = 'cat' THEN 'pip'
    WHEN mascot->>'species' = 'owl' THEN 'sage'
    WHEN mascot->>'species' = 'bear' THEN 'mocha'
    WHEN mascot->>'species' = 'blob' THEN 'fern'
    WHEN mascot->>'species' = 'bot' THEN 'milo'
    ELSE (ARRAY['milo','sage','pip','blu','mocha','fern'])[1 + abs(COALESCE((mascot->>'seed')::int, 0)) % 6]
  END)
WHERE NOT (mascot ? 'buddy') OR mascot ? 'species';

ALTER TABLE members ADD CONSTRAINT members_mascot_buddy_chk
  CHECK (mascot->>'buddy' IN ('milo','sage','pip','blu','mocha','fern') AND jsonb_typeof(mascot) = 'object');
