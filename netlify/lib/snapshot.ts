import raw from '../../public/data/feed.json';
import { verifySnapshot } from '../../collector/export';
export const feed=verifySnapshot(raw);
