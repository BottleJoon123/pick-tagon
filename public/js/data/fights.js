const FIGHTS = [
    // ── 메인 카드 ──
    {
        id: 'f1', section: 'main', sectionLabel: '메인 카드', sectionTime: '4월 12일 오전 10:00 (KST)',
        tag: 'MAIN EVENT', division: 'LIGHT HEAVYWEIGHT CHAMPIONSHIP',
        rounds: 5, weight: '라이트헤비웨이트', lbs: 205,
        f1: {
            name: '지리 프로차스카', nameEn: 'Jiří Procházka', record: '32-5-1', height: '190cm', reach: '203cm',
            odds: 1.75, rank: '#2 LIGHT HEAVYWEIGHT', country: 'CZE', age: 33, stance: '오소독스',
            slpm: 5.7, strAcc: 57, tdAvg: 0.51, subAvg: 0.17, koRate: 72, subRate: 9, decRate: 19,
            stats: [85, 68, 82, 72, 88],
            recent: [
                { r: 'W', opp: 'Rountree Jr.', method: 'KO · R2', event: 'UFC 311' },
                { r: 'W', opp: 'Jamahal Hill', method: 'KO · R1', event: 'UFC 311' },
                { r: 'L', opp: 'A. Pereira', method: 'KO · R2', event: 'UFC 303' },
                { r: 'W', opp: 'A. Pereira', method: 'Sub · R2', event: 'UFC 295' },
            ]
        },
        f2: {
            name: '카를로스 울버그', nameEn: 'Carlos Ulberg', record: '14-1', height: '193cm', reach: '196cm',
            odds: 2.10, rank: '#3 LIGHT HEAVYWEIGHT', country: 'NZL', age: 35, stance: '오소독스',
            slpm: 6.5, strAcc: 56, tdAvg: 0.55, subAvg: 0.18, koRate: 64, subRate: 7, decRate: 29,
            stats: [88, 62, 80, 70, 85],
            recent: [
                { r: 'W', opp: 'D. Reyes', method: 'KO · R1', event: 'UFC Perth' },
                { r: 'W', opp: 'J. Błachowicz', method: 'KO · R3', event: 'UFC 304' },
                { r: 'W', opp: 'A. Menifield', method: 'KO · R1', event: 'UFC 299' },
                { r: 'W', opp: 'I. Cutelaba', method: 'KO · R1', event: 'UFC 293' },
            ]
        },
        leftBias: 0.52
    },
    {
        id: 'f2', section: 'main', sectionLabel: '메인 카드', sectionTime: '4월 12일 오전 10:00 (KST)',
        tag: 'CO-MAIN EVENT', division: 'LIGHT HEAVYWEIGHT',
        rounds: 3, weight: '라이트헤비웨이트', lbs: 205,
        f1: {
            name: '아자마트 무르자카노프', nameEn: 'Azamat Murzakanov', record: '16-0', height: '183cm', reach: '196cm',
            odds: 1.55, rank: '#6 LIGHT HEAVYWEIGHT', country: 'RUS', age: 36, stance: '오소독스',
            slpm: 4.8, strAcc: 52, tdAvg: 1.2, subAvg: 0.1, koRate: 78, subRate: 6, decRate: 16,
            stats: [82, 72, 80, 74, 78],
            recent: [
                { r: 'W', opp: 'Jamahal Hill', method: 'KO · R2', event: 'UFC 317' },
                { r: 'W', opp: 'Devin Clark', method: 'KO · R1', event: 'UFC 314' },
                { r: 'W', opp: 'D. Ankalaev', method: 'KO · R3', event: 'UFC 311' },
                { r: 'W', opp: 'A. Trizos', method: 'KO · R1', event: 'UFC 296' },
            ]
        },
        f2: {
            name: '파울로 코스타', nameEn: 'Paulo Costa', record: '14-3', height: '185cm', reach: '188cm',
            odds: 2.55, rank: '언랭크드', country: 'BRA', age: 33, stance: '오소독스',
            slpm: 6.1, strAcc: 58, tdAvg: 0.4, subAvg: 0.1, koRate: 58, subRate: 6, decRate: 36,
            stats: [88, 55, 82, 72, 82],
            recent: [
                { r: 'W', opp: 'R. Kopylov', method: 'KO · R2', event: 'UFC 318' },
                { r: 'L', opp: 'S. Strickland', method: '판정', event: 'UFC 302' },
                { r: 'L', opp: 'L. Till', method: 'Sub · R2', event: 'UFC 278' },
                { r: 'L', opp: 'I. Adesanya', method: '판정', event: 'UFC 253' },
            ]
        },
        leftBias: 0.62
    },
    {
        id: 'f3', section: 'main', sectionLabel: '메인 카드', sectionTime: '4월 12일 오전 10:00 (KST)',
        tag: 'MAIN CARD', division: 'HEAVYWEIGHT',
        rounds: 3, weight: '헤비웨이트', lbs: 265,
        f1: {
            name: '커티스 블레이즈', nameEn: 'Curtis Blaydes', record: '17-4 1NC', height: '193cm', reach: '198cm',
            odds: 1.35, rank: '#4 HEAVYWEIGHT', country: 'USA', age: 33, stance: '오소독스',
            slpm: 3.5, strAcc: 54, tdAvg: 4.2, subAvg: 0.5, koRate: 28, subRate: 12, decRate: 60,
            stats: [65, 95, 85, 78, 70],
            recent: [
                { r: 'W', opp: 'A. Volkov', method: '판정', event: 'UFC 304' },
                { r: 'L', opp: 'S. Pavlovich', method: 'KO · R1', event: 'UFC 295' },
                { r: 'W', opp: 'J. Ngannou', method: 'TKD', event: 'UFC 280' },
                { r: 'W', opp: 'T. Aspinall', method: 'NC', event: 'UFC 304' },
            ]
        },
        f2: {
            name: '조시 호킷', nameEn: 'Josh Hokit', record: '8-2', height: '191cm', reach: '196cm',
            odds: 3.25, rank: '언랭크드', country: 'USA', age: 30, stance: '오소독스',
            slpm: 3.1, strAcc: 49, tdAvg: 2.1, subAvg: 0.3, koRate: 50, subRate: 25, decRate: 25,
            stats: [62, 78, 75, 68, 65],
            recent: [
                { r: 'W', opp: 'O. Adesanya', method: 'KO · R1', event: 'UFC Vegas 101' },
                { r: 'W', opp: 'M. Terrell', method: '판정', event: 'UFC Vegas 95' },
                { r: 'L', opp: 'S. Pavlovich', method: 'KO · R1', event: 'UFC 285' },
                { r: 'W', opp: 'K. Daukaus', method: '판정', event: 'UFC Vegas 88' },
            ]
        },
        leftBias: 0.70
    },
    {
        id: 'f4', section: 'main', sectionLabel: '메인 카드', sectionTime: '4월 12일 오전 10:00 (KST)',
        tag: 'MAIN CARD', division: 'LIGHT HEAVYWEIGHT',
        rounds: 3, weight: '라이트헤비웨이트', lbs: 205,
        f1: {
            name: '도미닉 레예스', nameEn: 'Dominick Reyes', record: '13-5', height: '193cm', reach: '203cm',
            odds: 1.80, rank: '#10 LIGHT HEAVYWEIGHT', country: 'USA', age: 34, stance: '오소독스',
            slpm: 5.2, strAcc: 53, tdAvg: 0.7, subAvg: 0.1, koRate: 54, subRate: 8, decRate: 38,
            stats: [80, 60, 78, 72, 80],
            recent: [
                { r: 'L', opp: 'C. Ulberg', method: 'KO · R1', event: 'UFC Perth' },
                { r: 'W', opp: 'R. Ikhine', method: 'KO · R2', event: 'UFC 303' },
                { r: 'W', opp: 'E. Perez', method: 'KO · R3', event: 'UFC 296' },
                { r: 'L', opp: 'J. Błachowicz', method: 'Sub · R2', event: 'UFC 291' },
            ]
        },
        f2: {
            name: '조니 워커', nameEn: 'Johnny Walker', record: '22-8', height: '196cm', reach: '203cm',
            odds: 2.05, rank: '#12 LIGHT HEAVYWEIGHT', country: 'BRA', age: 32, stance: '오소독스',
            slpm: 4.8, strAcc: 48, tdAvg: 0.5, subAvg: 0.3, koRate: 61, subRate: 9, decRate: 30,
            stats: [78, 58, 72, 65, 80],
            recent: [
                { r: 'W', opp: 'D. Dawodu', method: 'KO · R1', event: 'UFC 303' },
                { r: 'L', opp: 'A. Rakic', method: '판정', event: 'UFC 300' },
                { r: 'W', opp: 'P. Craig', method: '판정', event: 'UFC 297' },
                { r: 'W', opp: 'I. Aleksandar', method: 'KO · R1', event: 'UFC 296' },
            ]
        },
        leftBias: 0.52
    },
    {
        id: 'f5', section: 'main', sectionLabel: '메인 카드', sectionTime: '4월 12일 오전 10:00 (KST)',
        tag: 'MAIN CARD', division: 'FEATHERWEIGHT',
        rounds: 3, weight: '페더웨이트', lbs: 145,
        f1: {
            name: '컵 스완슨', nameEn: 'Cub Swanson', record: '30-14', height: '180cm', reach: '183cm',
            odds: 1.75, rank: '언랭크드', country: 'USA', age: 41, stance: '사우스포',
            slpm: 6.1, strAcc: 55, tdAvg: 0.3, subAvg: 0.2, koRate: 56, subRate: 11, decRate: 33,
            stats: [82, 52, 80, 68, 85],
            recent: [
                { r: 'W', opp: 'D. Ramirez', method: 'KO · R1', event: 'UFC 316' },
                { r: 'W', opp: 'V. Sayles', method: 'KO · R2', event: 'UFC 312' },
                { r: 'W', opp: 'C. Gutierrez', method: '판정', event: 'UFC Vegas 95' },
                { r: 'L', opp: 'J. Emmett', method: '판정', event: 'UFC Vegas 89' },
            ]
        },
        f2: {
            name: '네이트 랜드워', nameEn: 'Nate Landwehr', record: '18-7', height: '175cm', reach: '180cm',
            odds: 2.10, rank: '언랭크드', country: 'USA', age: 34, stance: '오소독스',
            slpm: 5.8, strAcc: 47, tdAvg: 1.1, subAvg: 0.2, koRate: 44, subRate: 11, decRate: 45,
            stats: [72, 65, 82, 65, 78],
            recent: [
                { r: 'L', opp: 'D. Santos', method: 'KO · R2', event: 'UFC Vegas 103' },
                { r: 'W', opp: 'A. Bahnam', method: 'KO · R1', event: 'UFC Vegas 96' },
                { r: 'W', opp: 'T. Moutinho', method: 'KO · R2', event: 'UFC Vegas 90' },
                { r: 'W', opp: 'A. Aldana', method: 'KO · R1', event: 'UFC 300' },
            ]
        },
        leftBias: 0.55
    },
    // ── 프렐림 ──
    {
        id: 'f6', section: 'prelim', sectionLabel: '프렐림', sectionTime: '4월 12일 오전 8:00 (KST)',
        tag: 'PRELIMS', division: 'FEATHERWEIGHT',
        rounds: 3, weight: '페더웨이트', lbs: 145,
        f1: {
            name: '파트리시우 피트불', nameEn: 'Patricio Pitbull', record: '37-8', height: '175cm', reach: '180cm',
            odds: 2.30, rank: '#13 FEATHERWEIGHT', country: 'BRA', age: 36, stance: '오소독스',
            slpm: 5.2, strAcc: 50, tdAvg: 0.8, subAvg: 0.5, koRate: 46, subRate: 14, decRate: 40,
            stats: [78, 72, 82, 70, 78],
            recent: [
                { r: 'L', opp: 'Y. Rodríguez', method: '판정', event: 'UFC 321' },
                { r: 'W', opp: 'D. Poirier', method: 'Sub · R4', event: 'UFC 316' },
                { r: 'W', opp: 'J. Aldrich', method: 'Sub · R3', event: 'UFC 311' },
                { r: 'L', opp: 'A. Pico', method: 'KO · R1', event: 'UFC 303' },
            ]
        },
        f2: {
            name: '에런 피코', nameEn: 'Aaron Pico', record: '13-5', height: '178cm', reach: '183cm',
            odds: 1.65, rank: '언랭크드', country: 'USA', age: 27, stance: '오소독스',
            slpm: 5.8, strAcc: 54, tdAvg: 1.2, subAvg: 0.3, koRate: 62, subRate: 8, decRate: 30,
            stats: [84, 68, 78, 65, 85],
            recent: [
                { r: 'W', opp: 'P. Pitbull', method: 'KO · R1', event: 'UFC 303' },
                { r: 'W', opp: 'B. Mitchell', method: 'KO · R2', event: 'UFC 298' },
                { r: 'L', opp: 'G. Rodrigues', method: 'Sub · R1', event: 'UFC 295' },
                { r: 'W', opp: 'C. Lemos', method: 'KO · R1', event: 'UFC 288' },
            ]
        },
        leftBias: 0.42
    },
    {
        id: 'f7', section: 'prelim', sectionLabel: '프렐림', sectionTime: '4월 12일 오전 8:00 (KST)',
        tag: 'PRELIMS', division: 'WELTERWEIGHT',
        rounds: 3, weight: '웰터웨이트', lbs: 170,
        f1: {
            name: '케빈 홀랜드', nameEn: 'Kevin Holland', record: '28-15', height: '188cm', reach: '196cm',
            odds: 1.70, rank: '언랭크드', country: 'USA', age: 32, stance: '오소독스',
            slpm: 5.9, strAcc: 51, tdAvg: 0.6, subAvg: 0.5, koRate: 47, subRate: 18, decRate: 35,
            stats: [80, 65, 78, 62, 82],
            recent: [
                { r: 'W', opp: 'R. Brown', method: 'KO · R2', event: 'UFC 315' },
                { r: 'L', opp: 'B. Covington', method: '판정', event: 'UFC 308' },
                { r: 'W', opp: 'M. Pereira', method: '판정', event: 'UFC 304' },
                { r: 'W', opp: 'T. Whittaker', method: 'KO · R1', event: 'UFC 300' },
            ]
        },
        f2: {
            name: '랜디 브라운', nameEn: 'Randy Brown', record: '20-7', height: '188cm', reach: '193cm',
            odds: 2.20, rank: '언랭크드', country: 'JAM', age: 35, stance: '오소독스',
            slpm: 4.7, strAcc: 48, tdAvg: 0.9, subAvg: 0.2, koRate: 45, subRate: 15, decRate: 40,
            stats: [70, 62, 78, 70, 74],
            recent: [
                { r: 'L', opp: 'K. Holland', method: 'KO · R2', event: 'UFC 315' },
                { r: 'W', opp: 'A. Dalcha', method: 'KO · R2', event: 'UFC 312' },
                { r: 'L', opp: 'G. Magny', method: '판정', event: 'UFC 308' },
                { r: 'W', opp: 'O. Akhmedov', method: '판정', event: 'UFC 303' },
            ]
        },
        leftBias: 0.58
    },
    {
        id: 'f8', section: 'prelim', sectionLabel: '프렐림', sectionTime: '4월 12일 오전 8:00 (KST)',
        tag: 'PRELIMS', division: 'LIGHTWEIGHT',
        rounds: 3, weight: '라이트웨이트', lbs: 155,
        f1: {
            name: '마테우스 감로트', nameEn: 'Mateusz Gamrot', record: '25-4 1NC', height: '178cm', reach: '188cm',
            odds: 1.40, rank: '#8 LIGHTWEIGHT', country: 'POL', age: 33, stance: '오소독스',
            slpm: 4.9, strAcc: 53, tdAvg: 3.1, subAvg: 0.7, koRate: 24, subRate: 40, decRate: 36,
            stats: [70, 92, 88, 78, 80],
            recent: [
                { r: 'W', opp: 'R. Jacoby', method: 'Sub · R3', event: 'UFC 314' },
                { r: 'W', opp: 'M. Hooker', method: '판정', event: 'UFC 312' },
                { r: 'L', opp: 'A. Tsarukyan', method: '판정', event: 'UFC 302' },
                { r: 'W', opp: 'B. Dariush', method: '판정', event: 'UFC 299' },
            ]
        },
        f2: {
            name: '에스테반 리보빅스', nameEn: 'Esteban Ribovics', record: '15-2', height: '180cm', reach: '185cm',
            odds: 3.00, rank: '언랭크드', country: 'ARG', age: 29, stance: '오소독스',
            slpm: 4.2, strAcc: 47, tdAvg: 1.4, subAvg: 0.4, koRate: 33, subRate: 27, decRate: 40,
            stats: [65, 72, 80, 68, 72],
            recent: [
                { r: 'W', opp: 'D. Santos', method: '판정', event: 'UFC 316' },
                { r: 'W', opp: 'J. Turner', method: 'Sub · R2', event: 'UFC 312' },
                { r: 'W', opp: 'B. Monteiro', method: 'KO · R1', event: 'UFC Vegas 99' },
                { r: 'L', opp: 'G. Ribeiro', method: '판정', event: 'UFC 299' },
            ]
        },
        leftBias: 0.65
    },
    {
        id: 'f9', section: 'prelim', sectionLabel: '프렐림', sectionTime: '4월 12일 오전 8:00 (KST)',
        tag: 'PRELIMS', division: 'STRAWWEIGHT',
        rounds: 3, weight: '스트로웨이트', lbs: 115,
        f1: {
            name: '타티아나 수아레스', nameEn: 'Tatiana Suarez', record: '12-1', height: '160cm', reach: '163cm',
            odds: 1.35, rank: '#2 STRAWWEIGHT', country: 'USA', age: 33, stance: '오소독스',
            slpm: 3.8, strAcc: 55, tdAvg: 5.2, subAvg: 1.8, koRate: 17, subRate: 58, decRate: 25,
            stats: [68, 98, 88, 82, 72],
            recent: [
                { r: 'W', opp: 'L. Godinez', method: 'Sub · R2', event: 'UFC 321' },
                { r: 'W', opp: 'C. Esparza', method: 'Sub · R2', event: 'UFC 316' },
                { r: 'W', opp: 'M. Dern', method: 'Sub · R1', event: 'UFC 313' },
                { r: 'L', opp: 'Z. Zhang', method: '판정', event: 'UFC 310' },
            ]
        },
        f2: {
            name: '루피 고디네스', nameEn: 'Loopy Godinez', record: '11-5', height: '163cm', reach: '168cm',
            odds: 3.10, rank: '#8 STRAWWEIGHT', country: 'MEX', age: 30, stance: '사우스포',
            slpm: 4.1, strAcc: 45, tdAvg: 1.2, subAvg: 0.3, koRate: 27, subRate: 18, decRate: 55,
            stats: [65, 68, 78, 68, 72],
            recent: [
                { r: 'L', opp: 'T. Suarez', method: 'Sub · R2', event: 'UFC 321' },
                { r: 'W', opp: 'A. Lamas', method: '판정', event: 'UFC 316' },
                { r: 'W', opp: 'S. Waterson', method: '판정', event: 'UFC 312' },
                { r: 'L', opp: 'M. Dern', method: 'Sub · R3', event: 'UFC 308' },
            ]
        },
        leftBias: 0.68
    },
    // ── 얼리 프렐림 ──
    {
        id: 'f10', section: 'early', sectionLabel: '얼리 프렐림', sectionTime: '4월 12일 오전 6:30 (KST)',
        tag: 'EARLY PRELIMS', division: 'LIGHTWEIGHT',
        rounds: 3, weight: '라이트웨이트', lbs: 155,
        f1: {
            name: '마르켈 메데로스', nameEn: 'MarQuel Mederos', record: '11-2', height: '180cm', reach: '185cm',
            odds: 1.80, rank: '언랭크드', country: 'USA', age: 27, stance: '오소독스',
            slpm: 4.5, strAcc: 52, tdAvg: 1.0, subAvg: 0.3, koRate: 55, subRate: 18, decRate: 27,
            stats: [78, 65, 78, 70, 78],
            recent: [
                { r: 'W', opp: 'J. Fischer', method: '판정', event: 'UFC Vegas 101' },
                { r: 'L', opp: 'R. Pettis', method: 'KO · R2', event: 'UFC Vegas 95' },
                { r: 'W', opp: 'D. Ferreira', method: 'Sub · R2', event: 'UFC Vegas 90' },
                { r: 'W', opp: 'N. Diaz', method: 'KO · R1', event: 'UFC 297' },
            ]
        },
        f2: {
            name: '크리스 파딜라', nameEn: 'Chris Padilla', record: '8-3', height: '178cm', reach: '183cm',
            odds: 2.05, rank: '언랭크드', country: 'USA', age: 29, stance: '오소독스',
            slpm: 3.9, strAcc: 46, tdAvg: 1.5, subAvg: 0.4, koRate: 38, subRate: 25, decRate: 37,
            stats: [65, 70, 75, 65, 70],
            recent: [
                { r: 'W', opp: 'T. Espinoza', method: '판정', event: 'UFC Vegas 99' },
                { r: 'W', opp: 'D. Calderwood', method: 'Sub · R1', event: 'UFC Vegas 95' },
                { r: 'L', opp: 'J. Buckley', method: 'KO · R1', event: 'UFC 316' },
                { r: 'W', opp: 'M. Acosta', method: 'KO · R2', event: 'UFC Vegas 88' },
            ]
        },
        leftBias: 0.52
    },
    {
        id: 'f11', section: 'early', sectionLabel: '얼리 프렐림', sectionTime: '4월 12일 오전 6:30 (KST)',
        tag: 'EARLY PRELIMS', division: 'MIDDLEWEIGHT',
        rounds: 3, weight: '미들웨이트', lbs: 185,
        f1: {
            name: '켈빈 가스텔럼', nameEn: 'Kelvin Gastelum', record: '20-10', height: '178cm', reach: '185cm',
            odds: 1.75, rank: '언랭크드', country: 'USA', age: 33, stance: '오소독스',
            slpm: 5.1, strAcc: 49, tdAvg: 0.6, subAvg: 0.3, koRate: 35, subRate: 25, decRate: 40,
            stats: [75, 62, 78, 65, 78],
            recent: [
                { r: 'L', opp: 'J. Ikram', method: 'KO · R1', event: 'UFC Vegas 103' },
                { r: 'L', opp: 'K. Daukaus', method: '판정', event: 'UFC Vegas 99' },
                { r: 'W', opp: 'D. Rodriguez', method: '판정', event: 'UFC 310' },
                { r: 'L', opp: 'K. Imavov', method: '판정', event: 'UFC 306' },
            ]
        },
        f2: {
            name: '찰스 래드케', nameEn: 'Charles Radtke', record: '10-4', height: '183cm', reach: '188cm',
            odds: 2.10, rank: '언랭크드', country: 'USA', age: 32, stance: '오소독스',
            slpm: 4.3, strAcc: 47, tdAvg: 1.8, subAvg: 0.5, koRate: 30, subRate: 30, decRate: 40,
            stats: [65, 72, 75, 68, 70],
            recent: [
                { r: 'W', opp: 'J. Buckley', method: '판정', event: 'UFC Vegas 101' },
                { r: 'W', opp: 'E. Bueso', method: 'KO · R2', event: 'UFC Vegas 95' },
                { r: 'L', opp: 'S. Strickland', method: '판정', event: 'UFC 308' },
                { r: 'W', opp: 'A. Karac', method: 'Sub · R1', event: 'UFC Vegas 88' },
            ]
        },
        leftBias: 0.50
    },
];
