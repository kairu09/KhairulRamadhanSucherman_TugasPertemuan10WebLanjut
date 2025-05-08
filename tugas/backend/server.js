const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());

// Fungsi untuk membuat data dummy
const buatPengguna = (id) => ({
    id,
    nama: `Pengguna ${id}`,
    email: `pengguna${id}@gmail.com`,
    umur: Math.floor(Math.random() * 50) + 18
});

// Endpoint untuk mengambil daftar pengguna
app.get('/api/pengguna', async (req, res) => {
    const jumlah = parseInt(req.query.jumlah) || 50;
    const halaman = parseInt(req.query.halaman) || 1;
    const offset = (halaman - 1) * jumlah;
    
    const janji = Array.from({ length: jumlah }, (_, i) => 
        new Promise((selesai) => {
            setTimeout(() => selesai(buatPengguna(offset + i + 1)), 5);
        })
    );
    
    const daftarPengguna = await Promise.all(janji);
    res.json(daftarPengguna);
});

// Endpoint untuk streaming data
app.get('/api/pengguna-stream', async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Transfer-Encoding', 'chunked');
    
    const jumlah = parseInt(req.query.jumlah) || 50;
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
    
    res.write('[');
    
    for (let i = 0; i < jumlah; i++) {
        const pengguna = buatPengguna(i + 1);
        const isLast = i === jumlah - 1;
        
        res.write(JSON.stringify(pengguna) + (isLast ? '' : ','));
        
        if (!isLast) {
            await delay(200); // Simulate delay between chunks
        }
    }
    
    res.write(']');
    res.end();
});

app.listen(3000, () => console.log('Server berjalan di http://localhost:3000'));