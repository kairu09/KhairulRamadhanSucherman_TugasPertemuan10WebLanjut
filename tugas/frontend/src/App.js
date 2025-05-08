import React, { useState, useEffect } from 'react';
import DaftarPengguna from './components/DaftarPengguna';
import './styles.css';

const CACHE_EXPIRY_MINUTES = 5;

const App = () => {
    const [pengguna, setPengguna] = useState([]);
    const [memuat, setMemuat] = useState(false);
    const [useWorker, setUseWorker] = useState(true);
    const [sortBy, setSortBy] = useState('');
    const [filterBy, setFilterBy] = useState({ age: 30 });
    const [streamingData, setStreamingData] = useState([]);
    const [metrics, setMetrics] = useState({
        promiseAllTime: 0,
        promiseAllSettledTime: 0,
        workerTime: 0,
        mainThreadTime: 0,
        dataSource: 'cache',
        streamingProgress: 0
    });

    const getCachedData = (key) => {
        const cached = localStorage.getItem(key);
        if (!cached) return null;
        
        const { data, timestamp } = JSON.parse(cached);
        const ageInMinutes = (Date.now() - timestamp) / 60000;
        
        if (ageInMinutes > CACHE_EXPIRY_MINUTES) {
            localStorage.removeItem(key);
            return null;
        }
        
        return data;
    };

    const setCachedData = (key, data) => {
        const cacheItem = {
            data,
            timestamp: Date.now()
        };
        localStorage.setItem(key, JSON.stringify(cacheItem));
    };

    const fetchParallelWithPromiseAll = async () => {
        const start = performance.now();
        try {
            const [page1, page2, page3] = await Promise.all([
                fetch('http://localhost:3000/api/pengguna?halaman=1'),
                fetch('http://localhost:3000/api/pengguna?halaman=2'),
                fetch('http://localhost:3000/api/pengguna?halaman=3')
            ]);
            
            const data = await Promise.all([page1.json(), page2.json(), page3.json()]);
            const combined = data.flat();
            
            setMetrics(prev => ({
                ...prev,
                promiseAllTime: performance.now() - start
            }));
            return combined;
        } catch (error) {
            console.error('Promise.all error:', error);
            return [];
        }
    };

    const fetchParallelWithAllSettled = async () => {
        const start = performance.now();
        const results = await Promise.allSettled([
            fetch('http://localhost:3000/api/pengguna?halaman=1'),
            fetch('http://localhost:3000/api/pengguna?halaman=2'),
            fetch('http://localhost:3000/api/pengguna?halaman=3')
        ]);
        
        const data = await Promise.all(
            results.map(result => 
                result.status === 'fulfilled' ? result.value.json() : []
            )
        );
        
        setMetrics(prev => ({
            ...prev,
            promiseAllSettledTime: performance.now() - start
        }));
        
        return data.flat();
    };

    const processInWorker = (data, sortBy, filterBy) => {
        return new Promise((resolve) => {
            const worker = new Worker('worker.js');
            worker.postMessage({ data, sortBy, filterBy });
            
            worker.onmessage = (e) => {
                setMetrics(prev => ({
                    ...prev,
                    workerTime: e.data.processingTime
                }));
                resolve(e.data.result);
                worker.terminate();
            };
        });
    };

    const processInMainThread = (data, sortBy, filterBy) => {
        const start = performance.now();
        let result = [...data];
        
        // Filtering
        if (filterBy && filterBy.age) {
            result = result.filter(user => user.umur > filterBy.age);
        }
        
        // Sorting
        if (sortBy) {
            if (sortBy === 'name') {
                result.sort((a, b) => a.nama.localeCompare(b.nama));
            } else if (sortBy === 'age') {
                result.sort((a, b) => b.umur - a.umur);
            }
        }
        
        const processingTime = performance.now() - start;
        setMetrics(prev => ({
            ...prev,
            mainThreadTime: processingTime
        }));
        
        return result;
    };

    const ambilPengguna = async (forceRefresh = false) => {
        setMemuat(true);
        
        const cacheKey = 'penggunaCache';
        const cachedData = !forceRefresh && getCachedData(cacheKey);
        
        if (cachedData) {
            const processedData = useWorker 
                ? await processInWorker(cachedData, sortBy, filterBy)
                : processInMainThread(cachedData, sortBy, filterBy);
            
            setPengguna(processedData);
            setMemuat(false);
            setMetrics(prev => ({ ...prev, dataSource: 'cache' }));
            return processedData;
        }
        
        try {
            const data = await fetchParallelWithPromiseAll();
            setCachedData(cacheKey, data);
            
            const processedData = useWorker 
                ? await processInWorker(data, sortBy, filterBy)
                : processInMainThread(data, sortBy, filterBy);
            
            setPengguna(processedData);
            setMetrics(prev => ({ ...prev, dataSource: 'server' }));
            return processedData;
        } catch (err) {
            console.error('Gagal mengambil data:', err);
            return [];
        } finally {
            setMemuat(false);
        }
    };

    const fetchStreamingData = async () => {
        setStreamingData([]);
        setMemuat(true);
        
        try {
            const response = await fetch('http://localhost:3000/api/pengguna-stream');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let partialData = '';
            let users = [];
            let count = 0;
            
            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                
                partialData += decoder.decode(value, { stream: true });
                
                // Process complete JSON objects
                while (partialData.includes('},{') || partialData.endsWith('}]')) {
                    const startIdx = partialData.indexOf('{');
                    const endIdx = partialData.indexOf('}') + 1;
                    
                    if (startIdx === -1 || endIdx === -1) break;
                    
                    try {
                        const jsonStr = partialData.substring(startIdx, endIdx);
                        const user = JSON.parse(jsonStr);
                        users.push(user);
                        count++;
                        
                        setStreamingData(prev => [...prev, user]);
                        setMetrics(prev => ({
                            ...prev,
                            streamingProgress: Math.floor((count / 50) * 100)
                        }));
                        
                        partialData = partialData.substring(endIdx + 1);
                    } catch (e) {
                        console.error('Error parsing JSON chunk:', e);
                        break;
                    }
                }
            }
            
            return users;
        } catch (err) {
            console.error('Gagal mengambil data streaming:', err);
            return [];
        } finally {
            setMemuat(false);
        }
    };

    useEffect(() => {
        ambilPengguna();
    }, [sortBy, filterBy, useWorker]);

    return (
        <div className="app-container">
            <h1>Eksplorasi Pengguna</h1>
            
            <div className="controls">
                <div className="control-group">
                    <label>Sort By:</label>
                    <select onChange={(e) => setSortBy(e.target.value)}>
                        <option value="">No Sorting</option>
                        <option value="name">Sort by Name</option>
                        <option value="age">Sort by Age</option>
                    </select>
                </div>
                
                <div className="control-group">
                    <label>Filter Min Age:</label>
                    <input 
                        type="number" 
                        value={filterBy.age}
                        onChange={(e) => setFilterBy({ age: parseInt(e.target.value) || 0 })}
                    />
                </div>
                
                <div className="control-group">
                    <label>
                        <input 
                            type="checkbox" 
                            checked={useWorker} 
                            onChange={(e) => setUseWorker(e.target.checked)} 
                        />
                        Use Web Worker
                    </label>
                </div>
                
                <button onClick={() => ambilPengguna(true)}>Segarkan Data</button>
                <button onClick={fetchStreamingData}>Load Streaming Data</button>
            </div>
            
            <div className="metrics">
                <h3>Performance Metrics:</h3>
                <div className="metric-grid">
                    <div><strong>Data Source:</strong> {metrics.dataSource}</div>
                    <div><strong>Promise.all Time:</strong> {metrics.promiseAllTime.toFixed(2)} ms</div>
                    <div><strong>Promise.allSettled Time:</strong> {metrics.promiseAllSettledTime.toFixed(2)} ms</div>
                    <div><strong>Worker Time:</strong> {metrics.workerTime.toFixed(2)} ms</div>
                    <div><strong>Main Thread Time:</strong> {metrics.mainThreadTime.toFixed(2)} ms</div>
                    {metrics.streamingProgress > 0 && (
                        <div><strong>Streaming Progress:</strong> {metrics.streamingProgress}%</div>
                    )}
                </div>
            </div>
            
            {memuat ? (
                <div className="loading-container">
                    <div className="loading-bar">
                        <div 
                            className="loading-progress"
                            style={{ width: `${metrics.streamingProgress || 70}%` }}
                        ></div>
                    </div>
                    <p>Memuat data pengguna...</p>
                </div>
            ) : (
                <>
                    <div className="data-info">
                        <p>Menampilkan {pengguna.length} pengguna (filtered & sorted)</p>
                        {streamingData.length > 0 && (
                            <p>Streamed {streamingData.length} users</p>
                        )}
                    </div>
                    
                    <div className="data-container">
                        <div className="data-section">
                            <h2>Main Data</h2>
                            <DaftarPengguna pengguna={pengguna} />
                        </div>
                        
                        {streamingData.length > 0 && (
                            <div className="data-section">
                                <h2>Streamed Data</h2>
                                <DaftarPengguna pengguna={streamingData} />
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default App;