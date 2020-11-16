import {fromEvent, Subject} from 'rxjs';
import {filter, take, takeWhile} from 'rxjs/operators';
import {WORKER_BLANK_FN} from '../consts/worker-fn-template';
import {WorkerFunction} from '../types/worker-function';

export class WebWorker<T = any, R = any> extends Subject<R> {
    private worker!: Worker;

    constructor(private url: string, options?: WorkerOptions) {
        super();

        try {
            this.worker = new Worker(url, options);
        } catch (e) {
            this.error(e);
        }

        fromEvent<MessageEvent>(this.worker, 'message')
            .pipe(
                takeWhile(() => !this.isStopped),
                filter(event => !!event.data),
            )
            .subscribe(event => {
                if (event.data.hasOwnProperty('error')) {
                    this.error(event.data.error);
                } else if (event.data.hasOwnProperty('result')) {
                    super.next(event.data.result);
                }
            });

        fromEvent<ErrorEvent>(this.worker, 'error')
            .pipe(takeWhile(() => !this.isStopped))
            .subscribe(event => {
                this.error(event.error);
            });
    }

    static fromFunction<T, R>(
        fn: WorkerFunction<T, R>,
        options?: WorkerOptions,
    ): WebWorker<T, R> {
        return new WebWorker<T, R>(WebWorker.createFnUrl(fn), options);
    }

    static execute<T, R>(fn: WorkerFunction<T, R>, data: T): Promise<R> {
        const worker = WebWorker.fromFunction(fn);
        const promise = worker.pipe(take(1)).toPromise();

        worker.postMessage(data);

        return promise;
    }

    private static createFnUrl(fn: WorkerFunction): string {
        const script = `(${WORKER_BLANK_FN})(${fn.toString()});`;

        const blob = new Blob([script], {type: 'text/javascript'});

        return URL.createObjectURL(blob);
    }

    complete() {
        this.worker.terminate();
        URL.revokeObjectURL(this.url);
        super.complete();
    }

    postMessage(value: T) {
        this.worker.postMessage(value);
    }
}
