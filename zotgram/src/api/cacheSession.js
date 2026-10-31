let generation = 0;

export const getCacheSession = () => generation;
export const resetCacheSession = () => { generation++; };
