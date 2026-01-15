// 문제 재구성 스크립트
const fs = require('fs');

// 현재 problems.js 읽기
const content = fs.readFileSync('problems.js', 'utf8');

// PROBLEMS 배열 추출 (정규식으로)
const match = content.match(/const PROBLEMS = \[([\s\S]*?)\];/);
if (!match) {
  console.error('PROBLEMS 배열을 찾을 수 없습니다');
  process.exit(1);
}

// 각 문제 객체 추출
const problemsText = match[1];
const problemRegex = /\{ id: (\d+),([^}]+)\}/g;
const problems = [];
let m;
while ((m = problemRegex.exec(problemsText)) !== null) {
  const id = parseInt(m[1]);
  const rest = m[2];

  // 각 필드 추출
  const diffMatch = rest.match(/difficulty: (\d+)/);
  const titleMatch = rest.match(/title: "([^"]+)"/);
  const platformMatch = rest.match(/platform: "([^"]+)"/);
  const problemIdMatch = rest.match(/problemId: "([^"]+)"/);
  const algorithmMatch = rest.match(/algorithm: "([^"]+)"/);
  const categoryMatch = rest.match(/category: "([^"]+)"/);

  problems.push({
    originalId: id,
    difficulty: parseInt(diffMatch[1]),
    title: titleMatch[1],
    platform: platformMatch[1],
    problemId: problemIdMatch[1],
    algorithm: algorithmMatch[1],
    category: categoryMatch ? categoryMatch[1] : null
  });
}

console.log(`총 ${problems.length}개 문제 발견`);

// 중복 problemId 찾기
const duplicateProblemIds = ['120802', '120803', '120804', '120805', '120806', '120807', '120817', '120820', '120829', '120831'];

// 1. L0 문제들 (기초·입문) - 새 ID 1번부터
const l0Problems = problems.filter(p => p.difficulty === 0);
console.log(`L0 문제: ${l0Problems.length}개`);

// 2. L1~L7 문제들 - 중복 제거
const l1to7Problems = problems.filter(p =>
  p.difficulty >= 1 && p.difficulty <= 7 &&
  !duplicateProblemIds.includes(p.problemId)
);
console.log(`L1~L7 문제 (중복 제거 후): ${l1to7Problems.length}개`);

// 3. L8 백준 문제들
const l8Problems = problems.filter(p => p.difficulty === 8);
console.log(`L8 백준 문제: ${l8Problems.length}개`);

// 새 ID 할당
let newId = 1;

// L0 문제들에 새 ID 할당
l0Problems.forEach(p => {
  p.newId = newId++;
});

// L1~L7 문제들에 새 ID 할당
l1to7Problems.forEach(p => {
  p.newId = newId++;
});

// L8 문제들에 새 ID 할당
l8Problems.forEach(p => {
  p.newId = newId++;
});

const totalProblems = l0Problems.length + l1to7Problems.length + l8Problems.length;
console.log(`\n총 문제 수: ${totalProblems}개`);
console.log(`L0: 1~${l0Problems.length}`);
console.log(`L1~L7: ${l0Problems.length + 1}~${l0Problems.length + l1to7Problems.length}`);
console.log(`L8: ${l0Problems.length + l1to7Problems.length + 1}~${totalProblems}`);

// 새 problems.js 생성
const generateProblemLine = (p) => {
  let line = `  { id: ${p.newId}, difficulty: ${p.difficulty}, title: "${p.title}", platform: "${p.platform}", problemId: "${p.problemId}", algorithm: "${p.algorithm}"`;
  if (p.category) {
    line += `, category: "${p.category}"`;
  }
  line += ' },';
  return line;
};

// 코딩테스트입문과 코딩기초트레이닝 분리
const introProblems = l0Problems.filter(p => p.category === '코딩테스트입문');
const trainingProblems = l0Problems.filter(p => p.category === '코딩기초트레이닝');

console.log(`\n코딩테스트 입문: ${introProblems.length}개`);
console.log(`코딩 기초 트레이닝: ${trainingProblems.length}개`);

// 난이도별 그룹화 (L1~L7)
const byDifficulty = {};
l1to7Problems.forEach(p => {
  if (!byDifficulty[p.difficulty]) byDifficulty[p.difficulty] = [];
  byDifficulty[p.difficulty].push(p);
});

let output = `// Python 코드카타 문제 목록 (총 ${totalProblems}개)
// difficulty: 0 (L0 기초·입문), 1-5 (L1~L5), 7 (레벨7 챌린지), 8 (레벨8 백준)
const PROBLEMS = [
  // ========== 기초·입문 L0 (1-${l0Problems.length}) ==========

  // 코딩테스트 입문 Lv.0 (1-${introProblems.length}) - ${introProblems.length}문제
`;

introProblems.forEach(p => {
  output += generateProblemLine(p) + '\n';
});

output += `
  // 코딩 기초 트레이닝 Lv.0 (${introProblems.length + 1}-${l0Problems.length}) - ${trainingProblems.length}문제
`;

trainingProblems.forEach(p => {
  output += generateProblemLine(p) + '\n';
});

output += `
  // ========== 프로그래머스 (${l0Problems.length + 1}-${l0Problems.length + l1to7Problems.length}) ==========

`;

// L1~L7 난이도별 출력
const difficultyLabels = {
  1: 'L1 입문',
  2: 'L2 기초',
  3: 'L3 중급',
  4: 'L4 중상',
  5: 'L5 고급',
  7: '레벨7 챌린지'
};

[1, 2, 3, 4, 5, 7].forEach(diff => {
  if (byDifficulty[diff]) {
    const probs = byDifficulty[diff];
    const startId = probs[0].newId;
    const endId = probs[probs.length - 1].newId;
    output += `  // ${difficultyLabels[diff]} (${startId}-${endId})\n`;
    probs.forEach(p => {
      output += generateProblemLine(p) + '\n';
    });
    output += '\n';
  }
});

output += `  // ========== 백준 L8 (${l0Problems.length + l1to7Problems.length + 1}-${totalProblems}) ==========

`;

l8Problems.forEach(p => {
  output += generateProblemLine(p) + '\n';
});

output += `];

// 난이도 정보
const DIFFICULTY_INFO = {
  0: { name: "L0", display: "🌱", label: "기초·입문", folder: "L0_기초입문" },
  1: { name: "L1", display: "⭐", label: "입문", folder: "L1_입문" },
  2: { name: "L2", display: "⭐⭐", label: "기초", folder: "L2_기초" },
  3: { name: "L3", display: "⭐⭐⭐", label: "중급", folder: "L3_중급" },
  4: { name: "L4", display: "⭐⭐⭐⭐", label: "중상", folder: "L4_중상" },
  5: { name: "L5", display: "⭐⭐⭐⭐⭐", label: "고급", folder: "L5_고급" },
  7: { name: "레벨7", display: "🔥", label: "챌린지", folder: "L7_챌린지" },
  8: { name: "레벨8", display: "💎", label: "백준", folder: "L8_백준" }
};

// 문제 URL 생성
function getProblemUrl(problem) {
  if (problem.platform === 'programmers') {
    return \`https://school.programmers.co.kr/learn/courses/30/lessons/\${problem.problemId}\`;
  } else {
    return \`https://www.acmicpc.net/problem/\${problem.problemId}\`;
  }
}

// GitHub 저장 경로 생성
function getGitHubPath(problem) {
  const diffInfo = DIFFICULTY_INFO[problem.difficulty];
  const platformFolder = problem.platform === "programmers" ? "programmers" : "baekjoon";
  const fileName = \`\${String(problem.id).padStart(3, '0')}_\${problem.title.replace(/[^가-힣a-zA-Z0-9]/g, '_')}.py\`;

  // L0 (기초·입문) 문제는 카테고리별 하위 폴더 사용
  if (problem.difficulty === 0 && problem.category) {
    const subFolder = problem.category === '코딩테스트입문' ? '입문' : '기초트레이닝';
    return \`\${platformFolder}/\${diffInfo.folder}/\${subFolder}/\${fileName}\`;
  }

  return \`\${platformFolder}/\${diffInfo.folder}/\${fileName}\`;
}
`;

fs.writeFileSync('problems_new.js', output);
console.log('\nproblems_new.js 생성 완료!');
