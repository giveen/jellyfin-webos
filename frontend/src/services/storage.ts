
export class Storage {
    get<T = any>(name: string, isJSON: boolean = true): T | null {
        if (typeof localStorage === 'undefined') return null;
        
        const item = localStorage.getItem(name);
        if (!item) return null;

        if (isJSON) {
            try {
                return JSON.parse(item) as T;
            } catch (e) {
                console.error("Error parsing JSON from localStorage", e);
                return null;
            }
        }
        return item as unknown as T;
    }

    set<T = any>(name: string, data: T, isJSON: boolean = true): T {
        if (typeof localStorage === 'undefined') return data;

        if (isJSON) {
            localStorage.setItem(name, JSON.stringify(data));
        } else {
            localStorage.setItem(name, data as any);
        }
        return data;
    }

    remove(name: string): void {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(name);
        }
    }

    exists(name: string): boolean {
        if (typeof localStorage !== 'undefined') {
            return localStorage.getItem(name) !== null;
        }
        return false;
    }
}

export const storage = new Storage();
