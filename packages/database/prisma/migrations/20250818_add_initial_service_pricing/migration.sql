-- Add initial service pricing data
-- This ensures services are available immediately after deployment

INSERT INTO service_pricing (id, service, "pricePerCall", category, active) VALUES
(gen_random_uuid(), 'google-calendar', 2, 'oauth', true),      -- 2 cents per call
(gen_random_uuid(), 'hello_world', 0, 'test', true),           -- Free test service
(gen_random_uuid(), 'google-drive', 3, 'oauth', true),         -- 3 cents per call
(gen_random_uuid(), 'github', 1, 'oauth', true),               -- 1 cent per call
(gen_random_uuid(), 'slack', 2, 'oauth', true)                 -- 2 cents per call
ON CONFLICT (service) DO UPDATE SET
  "pricePerCall" = EXCLUDED."pricePerCall",
  active = EXCLUDED.active;