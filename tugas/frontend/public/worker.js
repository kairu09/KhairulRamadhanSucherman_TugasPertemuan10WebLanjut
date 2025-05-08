self.onmessage = function (e) {
    const { data, action, sortBy, filterBy } = e.data;
    let result = [...data];
    
    const start = performance.now();
    
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
    
    self.postMessage({
        result,
        processingTime
    });
};