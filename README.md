# LOOQA Mirror

Interactive selfie-mirror system that stitches together:

- Canon 2000D live camera control (EDSDK native binding)
- Local AI portrait generation (Nano Banana / Gemini Nano)
- Template compositor for 4×6 + dual 2×6 layouts
- HiTi printer queue
- Event session management + admin tooling
- React/Tailwind fullscreen UX for the 63″ mirror

## Project layout

```
/app
  /backend          # Node.js 20 + Express API, WebSocket live view bridge
  /frontend         # React + Vite mirror/admin UI
  /camera           # TypeScript service + native N-API stub for Canon control
  /ai               # AI job queue + style handling
  /templates        # Template renderer facade (Sharp / Node-Canvas)
  /printer          # HiTi print queue wrapper
  /sessions         # Event session manager (JSON/SQLite ready)
  /config           # System-wide settings
  /public           # Static assets & drop-ins
```

## Getting started

```bash
npm install
npm run dev:backend   # starts Express API on :4000
npm run dev:frontend  # starts Vite dev server on :5173
```

Point `VITE_API_URL` to the backend origin if it's not `http://localhost:4000`.

## Next steps

- Implement real Canon EDSDK binding inside `app/camera/native`
- Connect AI processor to Gemini Nano / Nano Banana runtimes
- Fill template renderer with Sharp/Canvas logic + asset management
- Wire HiTi printer integration via Windows Print API
- Flesh out admin workflows, gallery sync, and authentication