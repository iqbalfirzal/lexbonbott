export function normalizeSymbol(rawSymbol) {
    if (!rawSymbol) return '';
    let s = rawSymbol.toUpperCase().trim();
    s = s.replace(/[^A-Z0-9]/g, '');
    
    if (s.endsWith('USDT') && !s.includes('/')) {
        return s.slice(0, -4) + '/USDT';
    }
    if (s.endsWith('BUSD') && !s.includes('/')) {
        return s.slice(0, -4) + '/BUSD';
    }
    if (s.endsWith('USD') && !s.includes('/')) {
        return s.slice(0, -3) + '/USD';
    }
    
    // If it's already in slash format or unsupported, return as is
    return s;
}
