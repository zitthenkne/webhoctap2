// room-texts.js — ghi CHỮ chung vào doc quizSession/t_* thay vì doc phiên (bản 74b). Phần thuần + lý do: room-texts-core.js.
import { db } from '../../core/firebase-init.js';
import { updateDoc, writeBatch, deleteField } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";
import { room, refs, SPLIT_TEXTS, SPLIT_MEMBERS } from './room-state.js';
import { TEXTS_CAP, MEMBER_CAP, sidOf, splitPatch, splitMemberPatch, nest, hasPath, shardDocId, MEMBER_ROOTS } from './room-texts-core.js';

const STALE_MS = 150000;      // cùng ngưỡng với isOnline() ở room-members (không import để khỏi vòng phụ thuộc)
const online = (m) => m.online !== false && Date.now() - (m.lastSeen || 0) < STALE_MS;

/** Mọi người đang online (trừ mình) đã biết đọc doc chữ chưa? Chưa -> vẫn ghi vào doc phiên để máy cũ thấy. */
export function textsReady() {
    const me = room.user?.uid;
    return SPLIT_TEXTS && room.members.every(m => m.uid === me || !online(m) || (m.cap || 0) >= TEXTS_CAP);
}
export function memberShardsReady() {
    const me = room.user?.uid;
    return SPLIT_MEMBERS && room.members.every(m => m.uid === me || !online(m) || (m.cap || 0) >= MEMBER_CAP);
}

/**
 * Thay cho updateDoc(refs.session(), patch) ở mọi chỗ ghi CHỮ chung. patch dùng đường chấm như cũ ('notes.q5', 'edits.q5.question'…).
 *  - Đường chữ -> doc chữ của khối câu đó (tạo nếu chưa có; doc của PHIÊN CŨ thì thay hẳn); phần còn lại -> doc phiên.
 *  - Cùng một lô ghi (writeBatch): xóa đường đó ở NƠI CŨ nếu chữ cũ còn nằm ở đó, để bản cũ không đè bản mới khi gộp.
 *  - Máy cũ đang trong phòng (textsReady() = false) -> ghi vào doc phiên như trước và dọn đường tương ứng ở doc chữ.
 */
export function sessionWrite(patch) {
    const { cur, shards } = splitPatch(patch);
    const ids = Object.keys(shards);
    if (!ids.length) return updateDoc(refs.session(), patch);
    const raw = room.curRaw || {};
    const sid = sidOf(raw);
    const batch = writeBatch(db);
    if (!textsReady()) {
        batch.update(refs.session(), patch);
        for (const id of ids) {
            const d = room.texts[shardDocId(id)];
            if (!d || d.sid !== sid) continue;
            const dels = {};
            for (const k of Object.keys(shards[id])) if (hasPath(d, k)) dels[k] = deleteField();
            if (Object.keys(dels).length) batch.update(refs.text(id), dels);
        }
        return batch.commit();
    }
    const curPatch = { ...cur };
    for (const id of ids) {
        const d = room.texts[shardDocId(id)];
        const base = { kind: 'texts', live: true, sid };
        if (d && d.sid !== sid) batch.set(refs.text(id), { ...base, ...nest(shards[id]) });                  // doc phiên cũ: thay hẳn
        else batch.set(refs.text(id), { ...base, ...nest(shards[id]) }, { mergeFields: [...Object.keys(base), ...Object.keys(shards[id])] });
        for (const k of Object.keys(shards[id])) if (hasPath(raw, k)) curPatch[k] = deleteField();           // chữ cũ còn ở doc phiên -> dọn
    }
    if (Object.keys(curPatch).length) batch.update(refs.session(), curPatch);
    return batch.commit();
}

/**
 * Thay cho updateDoc(refs.member(uid), patch) ở mọi chỗ ghi đáp án / bình luận / đánh dấu / cờ / "xong" / loại trừ (khóa theo câu).
 * Cùng quy tắc với sessionWrite: đường khóa-theo-câu → doc khối m_<uid>_b<k> của người đó, cùng lô xóa đường đó ở doc thành viên cũ nếu chữ
 * cũ còn nằm đấy; máy cũ trong phòng thì ghi doc thành viên như trước. Ghi NGUYÊN cả map ('answers: {}' khi làm lại phiên) còn nằm ở doc
 * thành viên và xóa luôn map đó trong mọi doc khối của người ấy.
 */
export function memberWrite(patch, forUid) {
    const u = forUid || room.user?.uid;
    const { base, shards, whole } = splitMemberPatch(patch);
    const ids = Object.keys(shards);
    if (!ids.length && !whole.length) return updateDoc(refs.member(u), patch);
    const sid = sidOf(room.curRaw);
    const raw = room.membersBase.find(m => m.uid === u) || {};
    const mine = Object.values(room.mshards).filter(d => d && d.uid === u && d.sid === sid);     // doc khối còn hiệu lực của người này
    const idOf = (d) => d.b;
    const batch = writeBatch(db);
    if (!memberShardsReady()) {
        batch.update(refs.member(u), patch);
        for (const d of mine) {
            const dels = {};
            for (const k of (shards[idOf(d)] ? Object.keys(shards[idOf(d)]) : [])) if (hasPath(d, k)) dels[k] = deleteField();
            for (const r of whole) if (r in d) dels[r] = deleteField();
            if (Object.keys(dels).length) batch.update(refs.mshard(u, idOf(d)), dels);
        }
        return batch.commit();
    }
    const basePatch = { ...base };
    for (const id of ids) {
        const d = room.mshards['m_' + u + '_' + id];
        const head = { kind: 'mshard', live: true, uid: u, sid, b: id };
        if (d && d.sid !== sid) batch.set(refs.mshard(u, id), { ...head, ...nest(shards[id]) });
        else batch.set(refs.mshard(u, id), { ...head, ...nest(shards[id]) }, { mergeFields: [...Object.keys(head), ...Object.keys(shards[id])] });
        for (const k of Object.keys(shards[id])) if (hasPath(raw, k)) basePatch[k] = deleteField();
    }
    for (const d of mine) for (const r of whole) if (r in d) batch.update(refs.mshard(u, idOf(d)), { [r]: deleteField() });
    if (Object.keys(basePatch).length) batch.update(refs.member(u), basePatch);
    return batch.commit();
}
