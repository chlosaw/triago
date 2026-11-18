# Triago

A full-stack React, TypeScript and Node.js help desk that turns support emails into tickets. A free AI model drafts each ticket with a title, summary, category and priority, and an agent reviews and accepts it.

## Live Preview

[triago.onrender.com](https://triago.onrender.com) _(replace with your Render link)_

## Design Reference

This project uses a custom responsive layout built for fast triage, clear ticket details and mobile-friendly use.

## Technologies Used

- React 18
- TypeScript
- Vite
- Node.js and Express
- PostgreSQL and Prisma
- Groq API (free AI, Llama 3.3)
- Docker

## Getting Started

```bash
git clone https://github.com/chlosaw/Triago.git
cd Triago
cp .env.example .env
docker compose up --build
```

Open http://localhost:8080 and click **Try the demo, no sign-up**.

## Features

- AI turns incoming emails into draft tickets
- Keyword rules draft tickets when the AI is unavailable
- Triage queue with accept, dismiss and undo
- Search by title, summary and requester
- Activity log and internal notes
- Organisations with admin and agent roles
- Dashboard with a 7-day chart
- Demo sandbox, no sign-up needed

## Available Scripts

- `npm run dev`: start the app in development mode
- `npm run build`: build for production
- `npm test`: run the tests
- `npm run lint`: check the code with ESLint

## Notes

- Get a free AI key at [console.groq.com/keys](https://console.groq.com/keys) and set `GROQ_API_KEY` in `.env`.
- Without a key, the app still works and keyword rules draft the tickets.
