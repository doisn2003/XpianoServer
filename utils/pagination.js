/**
 * Cursor-based pagination helper for social feed APIs.
 * Uses created_at timestamp as cursor for efficient, consistent pagination.
 *
 * Usage:
 *   const { cursor, limit } = parsePagination(req.query);
 *   // Add to SQL: WHERE created_at < $cursor ORDER BY created_at DESC LIMIT $limit + 1
 *   const result = buildPaginatedResponse(rows, limit);
 */

/**
 * Parse pagination parameters from query string.
 * @param {object} query - req.query
 * @returns {{ cursor: string|null, limit: number }}
 */
function parsePagination(query) {
    const limit = Math.min(Math.max(parseInt(query.limit) || 20, 1), 50);
    const cursor = query.cursor || null; // ISO timestamp string
    return { cursor, limit };
}

/**
 * Build paginated response with next_cursor.
 * Expects rows fetched with LIMIT = limit + 1 to detect hasMore.
 * @param {Array} rows - Query result rows (fetched with limit + 1)
 * @param {number} limit - Requested limit
 * @returns {{ data: Array, pagination: { has_more: boolean, next_cursor: string|null, count: number } }}
 */
function buildPaginatedResponse(rows, limit) {
    const hasMore = rows.length > limit;
    const data = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? data[data.length - 1].created_at : null;

    return {
        data,
        pagination: {
            has_more: hasMore,
            next_cursor: nextCursor,
            count: data.length
        }
    };
}

module.exports = { parsePagination, buildPaginatedResponse };
