document.addEventListener('DOMContentLoaded', () => {
    // === LOGIC ĐIỀU KHIỂN TAB ===
    const tabLinks = document.querySelectorAll('.tab-link');
    const tabContents = document.querySelectorAll('.tab-content');

    tabLinks.forEach(link => {
        link.addEventListener('click', () => {
            // Xóa active class khỏi tất cả
            tabLinks.forEach(item => item.classList.remove('active'));
            tabContents.forEach(item => item.classList.remove('active'));

            // Thêm active class cho tab được chọn
            link.classList.add('active');
            const tabId = link.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
            // Cuộn lên đầu + đưa tab đang chọn vào tầm nhìn (thanh tab cuộn ngang trên mobile)
            window.scrollTo({ top: 0, behavior: 'smooth' });
            link.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        });
    });

    // Nút Trước/Tiếp cuối mỗi tab: khỏi cuộn lên đầu trang để đổi tab
    const tabOrder = Array.from(tabLinks);
    tabContents.forEach(content => {
        const idx = tabOrder.findIndex(l => l.getAttribute('data-tab') === content.id);
        const nav = document.createElement('div');
        nav.className = 'flex justify-between items-center gap-2 mt-6 pt-4 border-t border-pink-100';
        const prev = tabOrder[idx - 1];
        const next = tabOrder[idx + 1];
        const mkBtn = (target, html, alignRight) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'px-4 py-2.5 rounded-xl text-sm font-semibold transition ' +
                (alignRight ? 'bg-pink-500 text-white hover:bg-pink-600 shadow' : 'bg-pink-50 text-pink-600 hover:bg-pink-100 border border-pink-200');
            b.innerHTML = html;
            b.addEventListener('click', () => target.click());
            return b;
        };
        nav.appendChild(prev ? mkBtn(prev, '<i class="fas fa-arrow-left"></i> Trước') : document.createElement('span'));
        const counter = document.createElement('span');
        counter.className = 'text-xs text-gray-400 font-medium';
        counter.textContent = `${idx + 1}/${tabOrder.length}`;
        nav.appendChild(counter);
        nav.appendChild(next ? mkBtn(next, 'Tiếp <i class="fas fa-arrow-right"></i>', true) : document.createElement('span'));
        content.appendChild(nav);
    });

    // Mobile: ẩn thanh lưu sticky khi bàn phím mở để không che nội dung đang gõ
    const form_ = document.getElementById('medical-record-form');
    form_.addEventListener('focusin', (e) => {
        if (e.target.matches('input, textarea, select') && !e.target.closest('.sticky-actions')) {
            document.body.classList.add('typing');
        }
    });
    form_.addEventListener('focusout', () => {
        setTimeout(() => {
            const a = document.activeElement;
            if (!a || !a.matches('input, textarea, select') || a.closest('.sticky-actions')) {
                document.body.classList.remove('typing');
            }
        }, 100);
    });

    // === CHIP GỢI Ý NHANH: bấm để điền, đỡ gõ trên điện thoại ===
    const nowTime = () => new Date().toTimeString().slice(0, 5);
    const todayDate = () => {
        const d = new Date();
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    };
    // id => danh sách gợi ý; phần tử có thể là chuỗi hoặc [nhãn, hàm trả giá trị]
    const quickFill = {
        'admission-time': [['Bây giờ', nowTime]],
        'admission-date': [['Hôm nay', todayDate]],
        'reason-for-admission': ['Sốt', 'Ho', 'Khó thở', 'Đau ngực', 'Đau bụng', 'Đau đầu', 'Chóng mặt', 'Nôn ói', 'Tiêu chảy', 'Phù', 'Mệt mỏi'],
        'history-internal': ['Chưa ghi nhận bệnh lý nội khoa', 'Tăng huyết áp', 'Đái tháo đường type 2', 'Rối loạn lipid máu', 'Viêm dạ dày'],
        'history-surgery': ['Chưa ghi nhận tiền căn ngoại khoa', 'Mổ lấy thai', 'Cắt ruột thừa'],
        'history-obgyne': ['Kinh nguyệt đều', 'PARA', 'Đã mãn kinh'],
        'history-allergy': ['Chưa ghi nhận dị ứng thuốc, thức ăn'],
        'history-habit': ['Không hút thuốc lá, không uống rượu bia', 'Hút thuốc lá', 'Uống rượu bia thường xuyên'],
        'history-family': ['Chưa ghi nhận bệnh lý tương tự trong gia đình', 'Gia đình có người tăng huyết áp', 'Gia đình có người đái tháo đường'],
        'exam-general': ['Bệnh nhân tỉnh, tiếp xúc tốt', 'Không sốt', 'Sinh hiệu ổn'],
        'exam-physical': ['Thể trạng trung bình', 'Gầy', 'Thừa cân – béo phì'],
        'exam-skin-mucosa': ['Da niêm hồng', 'Da niêm nhạt', 'Không vàng da'],
        'exam-hair-nail': ['Lông, tóc, móng không dễ gãy rụng'],
        'exam-thyroid-lymph': ['Tuyến giáp không to, hạch ngoại vi sờ không chạm'],
        'exam-edema-bleed': ['Không phù, không xuất huyết da niêm'],
        'exam-circulation': ['Tim đều, T1 T2 rõ, không âm thổi', 'Mỏm tim khoang liên sườn V đường trung đòn trái'],
        'exam-respiratory': ['Lồng ngực cân đối, di động đều theo nhịp thở', 'Rì rào phế nang êm dịu 2 phế trường, không rale'],
        'exam-digestive': ['Bụng mềm, không điểm đau khu trú', 'Gan lách sờ không chạm'],
        'exam-urinary': ['Chạm thận (-), bập bềnh thận (-)', 'Ấn các điểm niệu quản không đau'],
        'exam-neuro': ['Cổ mềm, không dấu thần kinh định vị'],
        'exam-musculoskeletal': ['Không giới hạn vận động, không biến dạng khớp'],
        'exam-ent': ['Chưa ghi nhận bất thường'],
        'exam-dental': ['Chưa ghi nhận bất thường'],
        'exam-eye': ['Chưa ghi nhận bất thường'],
        'labs-proposed': ['Công thức máu', 'Sinh hóa máu: ure, creatinine, AST, ALT, ion đồ', 'Đường huyết', 'CRP', 'Tổng phân tích nước tiểu', 'X-quang ngực thẳng', 'ECG', 'Siêu âm bụng tổng quát'],
        'prognosis': ['Tiên lượng gần: khá', 'Tiên lượng xa: dè dặt'],
        'prevention': ['Tuân thủ điều trị, tái khám đúng hẹn', 'Chế độ ăn hợp lý, tập luyện đều đặn']
    };
    Object.entries(quickFill).forEach(([id, items]) => {
        const el = document.getElementById(id);
        if (!el) return;
        const wrap = document.createElement('div');
        wrap.className = 'chips';
        items.forEach(item => {
            const [label, getValue] = Array.isArray(item) ? item : [item, () => item];
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'chip';
            btn.textContent = label;
            btn.addEventListener('click', () => {
                const text = getValue();
                if (el.tagName === 'TEXTAREA' && el.value.trim()) {
                    el.value = el.value.replace(/\s+$/, '') + '\n' + text;
                } else {
                    el.value = text;
                }
                el.dispatchEvent(new Event('input'));
            });
            wrap.appendChild(btn);
        });
        el.insertAdjacentElement('afterend', wrap);
    });

    // === CÁC TÍNH TOÁN TỰ ĐỘNG ===
    const patientYobInput = document.getElementById('patient-yob');
    const patientAgeInput = document.getElementById('patient-age');
    const heightInput = document.getElementById('vital-height');
    const weightInput = document.getElementById('vital-weight');
    const bmiInput = document.getElementById('vital-bmi');
    const recordDatetimeInput = document.getElementById('record-datetime');

    // Tự động tính tuổi từ NĂM SINH
    patientYobInput.addEventListener('input', () => {
        const yearOfBirth = parseInt(patientYobInput.value);
        const currentYear = new Date().getFullYear();
        if (yearOfBirth && yearOfBirth > 1900 && yearOfBirth <= currentYear) {
            const age = currentYear - yearOfBirth;
            patientAgeInput.value = age;
        }
    });

    // Tự động tính BMI
    const calculateBmi = () => {
        const height = parseFloat(heightInput.value);
        const weight = parseFloat(weightInput.value);
        if (height > 0 && weight > 0) {
            const heightInMeters = height / 100;
            const bmi = weight / (heightInMeters * heightInMeters);
            bmiInput.value = bmi.toFixed(2);
        } else {
            bmiInput.value = '';
        }
    };
    heightInput.addEventListener('input', calculateBmi);
    weightInput.addEventListener('input', calculateBmi);

    // Tự động điền ngày giờ làm bệnh án
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    recordDatetimeInput.value = now.toISOString().slice(0,16);


    // === XỬ LÝ FORM ===
    const form = document.getElementById('medical-record-form');
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        // Validation cơ bản
        const patientName = document.getElementById('patient-name').value;
        const reason = document.getElementById('reason-for-admission').value;
        if (!patientName.trim()) {
            alert('Vui lòng nhập họ tên bệnh nhân!');
            document.querySelector('.tab-link[data-tab="hanh-chinh"]').click();
            document.getElementById('patient-name').focus();
            return;
        }
         if (!reason.trim()) {
            alert('Vui lòng nhập lý do vào viện!');
            document.querySelector('.tab-link[data-tab="lydo-tiensu"]').click();
            document.getElementById('reason-for-admission').focus();
            return;
        }

        // Lấy ID
        const recordId = document.getElementById('medical-record-id').value || 'BA-' + Date.now();
        document.getElementById('medical-record-id').value = recordId;
        // Lấy trạng thái
        const recordStatus = document.getElementById('record-status')?.value || 'Đang chỉnh sửa';
        // TẠO ĐỐI TƯỢNG BỆNH ÁN CÓ CẤU TRÚC CHI TIẾT
        const record = {
            id: recordId,
            lastUpdated: new Date().toISOString(),
            status: recordStatus,
            hanhChinh: {
                hoTen: document.getElementById('patient-name').value,
                namSinh: document.getElementById('patient-yob').value,
                tuoi: document.getElementById('patient-age').value,
                gioiTinh: document.getElementById('patient-gender').value,
                danToc: document.getElementById('patient-ethnicity').value,
                ngheNghiep: document.getElementById('patient-occupation').value,
                diaChi: document.getElementById('patient-address').value,
                nguoiLienHe: document.getElementById('contact-name').value,
                sdtLienHe: document.getElementById('contact-phone').value,
                gioVaoVien: document.getElementById('admission-time').value,
                ngayVaoVien: document.getElementById('admission-date').value,
                ngayLamBenhAn: document.getElementById('record-datetime').value,
                soGiuong: document.getElementById('bed-number').value,
                soPhong: document.getElementById('room-number').value,
                benhVien: document.getElementById('hospital-name').value,
            },
            lyDoVaoVien: document.getElementById('reason-for-admission').value,
            benhSu: document.getElementById('illness-history').value,
            tienSu: {
                noiKhoa: document.getElementById('history-internal').value,
                ngoaiKhoa: document.getElementById('history-surgery').value,
                sanPhuKhoa: document.getElementById('history-obgyne').value,
                diUng: document.getElementById('history-allergy').value,
                thoiQuen: document.getElementById('history-habit').value,
                giaDinh: document.getElementById('history-family').value,
            },
            khamBenh: {
                sinhTon: {
                    mach: document.getElementById('vital-pulse').value,
                    nhietDo: document.getElementById('vital-temp').value,
                    huyetAp: document.getElementById('vital-bp').value,
                    nhipTho: document.getElementById('vital-resp').value,
                    spo2: document.getElementById('vital-spo2').value,
                    chieuCao: document.getElementById('vital-height').value,
                    canNang: document.getElementById('vital-weight').value,
                    bmi: document.getElementById('vital-bmi').value,
                },
                toanThan: document.getElementById('exam-general').value,
                theTrang: document.getElementById('exam-physical').value,
                daNiemMac: document.getElementById('exam-skin-mucosa').value,
                longTocMong: document.getElementById('exam-hair-nail').value,
                tuyenGiapHach: document.getElementById('exam-thyroid-lymph').value,
                phuXuatHuyet: document.getElementById('exam-edema-bleed').value,
                // Thêm từng trường cơ quan riêng biệt
                circulation: document.getElementById('exam-circulation').value,
                respiratory: document.getElementById('exam-respiratory').value,
                digestive: document.getElementById('exam-digestive').value,
                urinary: document.getElementById('exam-urinary').value,
                neuro: document.getElementById('exam-neuro').value,
                musculoskeletal: document.getElementById('exam-musculoskeletal').value,
                ent: document.getElementById('exam-ent').value,
                dental: document.getElementById('exam-dental').value,
                eye: document.getElementById('exam-eye').value,
            },
            tomTatBenhAn: document.getElementById('summary').value,
            chanDoanSoBo: document.getElementById('provisional-diagnosis').value,
            canLamSangDeNghi: document.getElementById('labs-proposed').value,
            ketQuaCanLamSang: document.getElementById('labs-results').value,
            chanDoanXacDinh: document.getElementById('final-diagnosis').value,
            huongDieuTri: document.getElementById('treatment-plan').value,
            tienLuong: document.getElementById('prognosis').value,
            duPhong: document.getElementById('prevention').value,
        };

        // Lưu vào localStorage
        console.log("Dữ liệu bệnh án được lưu:", record);
        let records = JSON.parse(localStorage.getItem('medicalRecords') || '[]');
        const idx = records.findIndex(r => r.id === recordId);
        if (idx >= 0) records[idx] = record;
        else records.push(record);
        localStorage.setItem('medicalRecords', JSON.stringify(records));

        // Phản hồi UI
        document.getElementById('save-button').disabled = true;
        document.querySelector('#save-button .button-text').classList.add('hidden');
        document.querySelector('#save-button .button-spinner').classList.remove('hidden');
        
        setTimeout(() => {
            document.getElementById('save-message').classList.remove('hidden');
            setTimeout(() => {
                window.location.href = '../study-room/waiting-room.html';
            }, 1000);
        }, 500);
    });

    // === TỰ ĐỘNG TÓM TẮT BỆNH ÁN (TIỀN SỬ CHI TIẾT) ===
    const autoSummaryBtn = document.getElementById('auto-summary-btn');
    if (autoSummaryBtn) {
        autoSummaryBtn.addEventListener('click', () => {
            const name = document.getElementById('patient-name').value;
            const yob = document.getElementById('patient-yob').value;
            const age = document.getElementById('patient-age').value;
            const gender = document.getElementById('patient-gender').value;
            const reason = document.getElementById('reason-for-admission').value;
            const illness = document.getElementById('illness-history').value;
            const pulse = document.getElementById('vital-pulse').value;
            const temp = document.getElementById('vital-temp').value;
            const bp = document.getElementById('vital-bp').value;
            const resp = document.getElementById('vital-resp').value;
            const spo2 = document.getElementById('vital-spo2').value;
            const examGeneral = document.getElementById('exam-general').value;
            const examOrgans = ['exam-circulation', 'exam-respiratory', 'exam-digestive', 'exam-urinary', 'exam-neuro', 'exam-musculoskeletal', 'exam-ent', 'exam-dental', 'exam-eye']
                .map(id => document.getElementById(id).value.trim())
                .filter(Boolean)
                .join('; ');
            const provisionalDx = document.getElementById('provisional-diagnosis').value;
            // Tiền sử chi tiết
            const historyInternal = document.getElementById('history-internal').value;
            const historySurgery = document.getElementById('history-surgery').value;
            const historyObgyne = document.getElementById('history-obgyne').value;
            const historyAllergy = document.getElementById('history-allergy').value;
            const historyHabit = document.getElementById('history-habit').value;
            const historyFamily = document.getElementById('history-family').value;

            // Giới tính tiếng Việt
            let genderText = 'bệnh nhân';
            if (gender === 'Nam') genderText = 'Bệnh nhân nam';
            else if (gender === 'Nữ') genderText = 'Bệnh nhân nữ';
            else if (gender) genderText = 'Bệnh nhân ' + gender.toLowerCase();
            else genderText = 'Bệnh nhân';

            // Tuổi
            let ageText = '';
            if (age) ageText = `, ${age} tuổi`;
            else if (yob) {
                const currentYear = new Date().getFullYear();
                ageText = `, ${currentYear - parseInt(yob)} tuổi`;
            }

            // Lý do vào viện
            let reasonText = reason ? `, vào viện vì ${reason.trim()}` : '';

            // Dòng đầu tiên
            let summary = `${genderText}${ageText}${reasonText}.`;

            // Hội chứng/triệu chứng chính
            let syndromeList = [];
            if (illness) syndromeList.push(illness.trim());
            if (examGeneral) syndromeList.push(examGeneral.trim());
            if (examOrgans) syndromeList.push(examOrgans.trim());
            if (provisionalDx) syndromeList.push('Chẩn đoán sơ bộ: ' + provisionalDx.trim());
            if (syndromeList.length > 0) {
                summary += '\n\nQua hỏi bệnh và thăm khám phát hiện các hội chứng và triệu chứng sau:';
                syndromeList.forEach(item => {
                    summary += `\n- ${item}`;
                });
            }

            // Sinh hiệu
            let vitalSigns = [];
            if (pulse) vitalSigns.push(`Mạch ${pulse} l/p`);
            if (temp) vitalSigns.push(`Nhiệt độ ${temp}°C`);
            if (bp) vitalSigns.push(`Huyết áp ${bp} mmHg`);
            if (resp) vitalSigns.push(`Nhịp thở ${resp} l/p`);
            if (spo2) vitalSigns.push(`SpO2 ${spo2}%`);
            if (vitalSigns.length > 0) {
                summary += `\n\nSinh hiệu: ${vitalSigns.join(', ')}.`;
            }

            // Tiền sử chi tiết
            let historyDetail = '';
            if (historyInternal || historySurgery || historyObgyne || historyAllergy || historyHabit || historyFamily) {
                historyDetail += '\n\nTiền sử:';
                if (historyInternal) historyDetail += `\n- Nội khoa: ${historyInternal}`;
                if (historySurgery) historyDetail += `\n- Ngoại khoa: ${historySurgery}`;
                if (historyObgyne) historyDetail += `\n- Sản phụ khoa: ${historyObgyne}`;
                if (historyAllergy) historyDetail += `\n- Dị ứng: ${historyAllergy}`;
                if (historyHabit) historyDetail += `\n- Thói quen: ${historyHabit}`;
                if (historyFamily) historyDetail += `\n- Gia đình: ${historyFamily}`;
            }
            summary += historyDetail;

            document.getElementById('summary').value = summary.trim();
        });
    }

    // === TỰ ĐỘNG ĐIỀN FORM KHI SỬA BỆNH ÁN ===
    // Lấy id từ query string
    function getQueryParam(name) {
        const url = new URL(window.location.href);
        return url.searchParams.get(name);
    }
    const recordIdFromUrl = getQueryParam('id');
    if (recordIdFromUrl) {
        let records = [];
        try {
            records = JSON.parse(localStorage.getItem('medicalRecords')) || [];
        } catch (e) { records = []; }
        const record = records.find(r => r.id == recordIdFromUrl);
        if (record) {
            document.getElementById('medical-record-id').value = record.id;
            // Trạng thái
            if (record.status) {
                document.getElementById('record-status').value = record.status;
            }
            // Hành chính
            if (record.hanhChinh) {
                document.getElementById('patient-name').value = record.hanhChinh.hoTen || '';
                document.getElementById('patient-yob').value = record.hanhChinh.namSinh || '';
                document.getElementById('patient-age').value = record.hanhChinh.tuoi || '';
                document.getElementById('patient-gender').value = record.hanhChinh.gioiTinh || '';
                document.getElementById('patient-ethnicity').value = record.hanhChinh.danToc || '';
                document.getElementById('patient-occupation').value = record.hanhChinh.ngheNghiep || '';
                document.getElementById('patient-address').value = record.hanhChinh.diaChi || '';
                document.getElementById('contact-name').value = record.hanhChinh.nguoiLienHe || '';
                document.getElementById('contact-phone').value = record.hanhChinh.sdtLienHe || '';
                document.getElementById('admission-time').value = record.hanhChinh.gioVaoVien || '';
                document.getElementById('admission-date').value = record.hanhChinh.ngayVaoVien || '';
                document.getElementById('record-datetime').value = record.hanhChinh.ngayLamBenhAn || '';
                document.getElementById('bed-number').value = record.hanhChinh.soGiuong || record.hanhChinh.bedNumber || '';
                document.getElementById('room-number').value = record.hanhChinh.soPhong || record.hanhChinh.roomNumber || '';
                document.getElementById('hospital-name').value = record.hanhChinh.benhVien || '';
            }
            // Lý do, bệnh sử, tiền sử
            document.getElementById('reason-for-admission').value = record.lyDoVaoVien || '';
            document.getElementById('illness-history').value = record.benhSu || '';
            if (record.tienSu) {
                document.getElementById('history-internal').value = record.tienSu.noiKhoa || '';
                document.getElementById('history-surgery').value = record.tienSu.ngoaiKhoa || '';
                document.getElementById('history-obgyne').value = record.tienSu.sanPhuKhoa || '';
                document.getElementById('history-allergy').value = record.tienSu.diUng || '';
                document.getElementById('history-habit').value = record.tienSu.thoiQuen || '';
                document.getElementById('history-family').value = record.tienSu.giaDinh || '';
            }
            // Khám bệnh
            if (record.khamBenh && record.khamBenh.sinhTon) {
                document.getElementById('vital-pulse').value = record.khamBenh.sinhTon.mach || '';
                document.getElementById('vital-temp').value = record.khamBenh.sinhTon.nhietDo || '';
                document.getElementById('vital-bp').value = record.khamBenh.sinhTon.huyetAp || '';
                document.getElementById('vital-resp').value = record.khamBenh.sinhTon.nhipTho || '';
                document.getElementById('vital-spo2').value = record.khamBenh.sinhTon.spo2 || '';
                document.getElementById('vital-height').value = record.khamBenh.sinhTon.chieuCao || '';
                document.getElementById('vital-weight').value = record.khamBenh.sinhTon.canNang || '';
                document.getElementById('vital-bmi').value = record.khamBenh.sinhTon.bmi || '';
            }
            if (record.khamBenh) {
                document.getElementById('exam-general').value = record.khamBenh.toanThan || '';
                document.getElementById('exam-physical').value = record.khamBenh.theTrang || '';
                document.getElementById('exam-skin-mucosa').value = record.khamBenh.daNiemMac || '';
                document.getElementById('exam-hair-nail').value = record.khamBenh.longTocMong || '';
                document.getElementById('exam-thyroid-lymph').value = record.khamBenh.tuyenGiapHach || '';
                document.getElementById('exam-edema-bleed').value = record.khamBenh.phuXuatHuyet || '';
                document.getElementById('exam-circulation').value = record.khamBenh.circulation || '';
                document.getElementById('exam-respiratory').value = record.khamBenh.respiratory || '';
                document.getElementById('exam-digestive').value = record.khamBenh.digestive || '';
                document.getElementById('exam-urinary').value = record.khamBenh.urinary || '';
                document.getElementById('exam-neuro').value = record.khamBenh.neuro || '';
                document.getElementById('exam-musculoskeletal').value = record.khamBenh.musculoskeletal || '';
                document.getElementById('exam-ent').value = record.khamBenh.ent || '';
                document.getElementById('exam-dental').value = record.khamBenh.dental || '';
                document.getElementById('exam-eye').value = record.khamBenh.eye || '';
            }
            document.getElementById('labs-proposed').value = record.canLamSangDeNghi || '';
            document.getElementById('labs-results').value = record.ketQuaCanLamSang || '';
            // Chẩn đoán, điều trị
            document.getElementById('summary').value = record.tomTatBenhAn || '';
            document.getElementById('provisional-diagnosis').value = record.chanDoanSoBo || '';
            document.getElementById('final-diagnosis').value = record.chanDoanXacDinh || '';
            document.getElementById('treatment-plan').value = record.huongDieuTri || '';
            document.getElementById('prognosis').value = record.tienLuong || '';
            document.getElementById('prevention').value = record.duPhong || '';
        }
    }

    // TỰ ĐỘNG CHUYỂN TÊN NGƯỜI BỆNH THÀNH IN HOA
    const patientNameInput = document.getElementById('patient-name');
    if (patientNameInput) {
        patientNameInput.addEventListener('input', function(e) {
            this.value = this.value.toUpperCase();
        });
    }
});