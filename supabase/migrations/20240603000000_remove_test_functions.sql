-- Remove test functions that are not needed in production
DROP FUNCTION IF EXISTS check_stripe_columns();
DROP FUNCTION IF EXISTS check_stripe_functions();
