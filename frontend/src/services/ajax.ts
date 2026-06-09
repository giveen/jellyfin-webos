
export interface AjaxSettings {
    method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
    headers?: Record<string, string>;
    timeout?: number;
    data?: any;
    success?: (data: any) => void;
    error?: (err: { error: string | number }) => void;
    abort?: (err: { error: string }) => void;
}

export class Ajax {
    request(url: string, settings: AjaxSettings = {}): XMLHttpRequest {
        const method = settings.method || 'GET';
        const xhr = new XMLHttpRequest();
        
        xhr.open(method, url);

        if (settings.headers) {
            for (const h in settings.headers) {
                xhr.setRequestHeader(h, settings.headers[h]);
            }
        }

        if (settings.timeout) {
            xhr.timeout = settings.timeout;
        }

        xhr.ontimeout = () => {
            if (settings.error) {
                settings.error({ error: 'timeout' });
            }
        };

        xhr.onerror = () => {
            if (settings.error) {
                settings.error({ error: String(xhr.status) });
            }
        };

        xhr.onabort = () => {
            if (settings.abort) {
                settings.abort({ error: 'abort' });
            }
        };

        xhr.onreadystatechange = () => {
            if (xhr.readyState === XMLHttpRequest.DONE) {
                if (xhr.status === 200) {
                    if (settings.success) {
                        try {
                            settings.success(JSON.parse(xhr.responseText));
                        } catch (e) {
                            console.error(e);
                            if (e instanceof SyntaxError) {
                                settings.error?.({ error: "The server did not return valid JSON data." });
                            } else if (settings.error) {
                                settings.error({ error: "0" });
                            }
                        }
                    }
                } else if (xhr.status === 204) {
                    if (settings.success) {
                        settings.success({ success: true });
                    }
                } else if (settings.error) {
                    settings.error({ error: String(xhr.status) });
                }
            }
        };

        if (settings.data) {
            xhr.send(typeof settings.data === 'string' ? settings.data : JSON.stringify(settings.data));
        } else {
            xhr.send();
        }
        return xhr;
    }
}

export const ajax = new Ajax();
