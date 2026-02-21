-- Create an atomic function to increment product stock in a thread-safe manner
CREATE OR REPLACE FUNCTION increment_stock_atomic(p_product_id uuid, p_quantity integer)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER -- Needs to bypass RLS to increment stock, similar to decrement_stock_atomic
AS $$
DECLARE
    v_new_stock integer;
    v_previous_stock integer;
BEGIN
    -- Input validation
    IF p_quantity <= 0 THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Quantity must be greater than zero'
        );
    END IF;

    -- Update stock securely with row-level locking
    UPDATE public.products
    SET 
        stock_quantity = stock_quantity + p_quantity,
        updated_at = NOW()
    WHERE id = p_product_id
    RETURNING stock_quantity, (stock_quantity - p_quantity) INTO v_new_stock, v_previous_stock;

    IF v_new_stock IS NULL THEN
        RETURN json_build_object(
            'success', false,
            'error', 'Product not found'
        );
    END IF;

    RETURN json_build_object(
        'success', true,
        'previous_stock', v_previous_stock,
        'new_stock', v_new_stock
    );
END;
$$;

-- Grant execution to authenticated users
GRANT EXECUTE ON FUNCTION increment_stock_atomic(uuid, integer) TO authenticated;
