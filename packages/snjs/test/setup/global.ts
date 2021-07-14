import { version } from '../../package.json';

//@ts-ignore
global['__VERSION__'] = global['SnjsVersion'] = version;
