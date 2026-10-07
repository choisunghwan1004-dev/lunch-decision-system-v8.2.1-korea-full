const express = require('express');
const session = require('express-session');
const path = require('path');
require('dotenv').config();

const authRouter = require('./routes/auth');
const adminRouter = require('./routes/admin');
const recommendationRouter = require('./routes/recommendation');
const userRouter = require('./routes/user');
const contextRouter = require('./routes/context');

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 4 }
}));

app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/auth', authRouter);
app.use('/api/admin', adminRouter);
app.use('/api/recommendation', recommendationRouter);
app.use('/api/user', userRouter);
app.use('/api/context', contextRouter);

app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public', 'admin.html')));
app.get('/health', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => {
  console.log(`Lunch Decision System V2: http://localhost:${PORT}`);
  console.log(`Admin: http://localhost:${PORT}/admin`);
});
