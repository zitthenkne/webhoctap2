// Nói để viết: lệnh bằng lời -> dấu câu / xuống dòng, cách chữ + viết hoa khi nối vào chữ đã có.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spokenText, joinChunk } from '../page/quiz-dictation.js';

test('lệnh bằng lời thành dấu, dọn khoảng trắng quanh dấu', () => {
    assert.equal(spokenText('tiền sản giật nặng dấu phẩy cho magie sulfat dấu chấm'), 'tiền sản giật nặng, cho magie sulfat.');
    assert.equal(spokenText('chẩn đoán dấu hai chấm tiền sản giật'), 'chẩn đoán: tiền sản giật');
    assert.equal(spokenText('có co giật không dấu chấm hỏi'), 'có co giật không?');
    assert.equal(spokenText('xử trí xuống dòng gạch đầu dòng nhập viện gạch đầu dòng hạ áp'), 'xử trí\n- nhập viện\n- hạ áp');
    assert.equal(spokenText('liều mở ngoặc tĩnh mạch đóng ngoặc'), 'liều (tĩnh mạch)');
    assert.equal(spokenText('HA 3.5 dấu phẩy mạch 120'), 'HA 3.5, mạch 120');
});

test('không đổi chữ thường trùng một phần lệnh ("chấm điểm", "hai chấm xuất huyết")', () => {
    assert.equal(spokenText('chấm điểm theo barem'), 'chấm điểm theo barem');
    assert.equal(spokenText('có hai chấm xuất huyết'), 'có hai chấm xuất huyết');
});

test('nối vào chữ đã có: cách chữ, viết hoa đầu câu / đầu dòng / ô trống', () => {
    assert.equal(joinChunk('', 'tiền sản giật nặng'), 'Tiền sản giật nặng');
    assert.equal(joinChunk('Chẩn đoán:', 'tiền sản giật'), ' tiền sản giật');
    assert.equal(joinChunk('Tiền sản giật.', 'xử trí nhập viện'), ' Xử trí nhập viện');
    assert.equal(joinChunk('Xử trí\n- ', 'nhập viện'), 'Nhập viện');
    assert.equal(joinChunk('Bệnh nhân nữ', 'dấu phẩy 32 tuổi'), ', 32 tuổi');
    assert.equal(joinChunk('ý một dấu', 'xuống dòng ý hai'), '\nÝ hai');
    assert.equal(joinChunk('a', '   '), '');
});
