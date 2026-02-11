# Xpiano Backend

Backend API for Xpiano - Piano rental and sales platform

## Production Deployment

This backend is deployed on Render.com

### Environment Variables Required:
- `NODE_ENV=production`
- `PORT=5000`
- `DATABASE_URL` - PostgreSQL connection string from Supabase
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_KEY` - Supabase service role key
- `JWT_SECRET` - JWT signing secret
- `FRONTEND_URL` - Frontend URL for CORS
- Email config variables for password reset

### Local Development

```bash
npm install
npm run dev
```

### Production Start

```bash
npm start
```

## API Documentation

See main README.md for full API documentation.
