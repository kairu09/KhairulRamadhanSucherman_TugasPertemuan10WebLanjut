import React from 'react';

const DaftarPengguna = ({ pengguna }) => {
    return (
        <div className="user-list">
            {pengguna.map((p) => (
                <div key={p.id} className="user-card">
                    <h3>{p.nama}</h3>
                    <p>Email: {p.email}</p>
                    <p>Umur: {p.umur} tahun</p>
                </div>
            ))}
        </div>
    );
};

export default DaftarPengguna;