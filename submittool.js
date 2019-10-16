const API_BASE = 'https://api.github.com';

async function fetchApi(path) {
	const res = await fetch(API_BASE + path);
	if (!res.ok) throw new Error('response not ok');
	return await res.json();
}

const PATTERN_NAME_PIXEL = /Screenshot_(\d{4})(\d\d)(\d\d)-(\d\d)(\d\d)(\d\d)\./i;

function guessDate(name) {
	const mPixel = PATTERN_NAME_PIXEL.exec(name);
	if (mPixel !== null) {
		return new Date(+mPixel[1], +mPixel[2] - 1, +mPixel[3], +mPixel[4], +mPixel[5], +mPixel[6]);
	}
	return null;
}

function setLocalDate(o, d) {
	o.valueAsNumber = d.getTime() - new Date(1970, 0).getTime();
}

function getLocalDate(o) {
	return new Date(new Date(1970, 0).getTime() + o.valueAsNumber);
}

const readPullForm = document.getElementById('read-pull');
const readPullSubmit = document.getElementById('read-pull-submit');
const preview = document.getElementById('preview');
const compileForm = document.getElementById('compile');
const compileSubmit = document.getElementById('compile-submit');
const newForm = document.getElementById('new');
const newAction = document.getElementById('new-action');
const newSubmit = document.getElementById('new-submit');

const PATTERN_PR_URL = /https:\/\/github\.com\/([\w-]+)\/([\w.-]+)\/pull\/(\d+)/i;

async function readPull(url) {
	const m = PATTERN_PR_URL.exec(url);
	if (m === null) throw new Error('URL doesn\'t match pattern');
	const [, dstRepoOwner, dstRepo, pullNum] = m;

	const pull = await fetchApi(`/repos/${dstRepoOwner}/${dstRepo}/pulls/${pullNum}`);
	if (pull.base.repo.name !== dstRepo) alert('pull base repo doesn\'t match. this might get weird');
	if (pull.head.repo.name !== dstRepo) alert('pull head repo doesn\'t match. this might get weird');

	compileForm.elements.owner.value = pull.head.repo.owner.login;
	compileForm.elements.repo.value = pull.head.repo.name;
	compileForm.elements.branch.value = pull.head.ref;

	const compare = await fetchApi(`/repos/${dstRepoOwner}/${dstRepo}/compare/${pull.base.ref}...${pull.head.label}`);
	const newShots = compare.files.filter((file) => {
		return file.filename.startsWith('shots/') && file.status === 'added';
	});

	preview.innerHTML = '';
	for (const shot of newShots) {
		const img = document.createElement('img');
		img.src = `https://raw.githubusercontent.com/${pull.head.repo.owner.login}/${pull.head.repo.name}/${pull.head.ref}/${shot.filename}`;
		preview.appendChild(img);
	}

	if (newShots.length >= 1) {
		const nameParts = newShots[0].filename.split('/');
		const nameLastPart = nameParts[nameParts.length - 1];
		const d = guessDate(nameLastPart) || new Date(pull.created_at);
		setLocalDate(compileForm.elements.date, d);

		compileForm.elements.image_above.value = `/${newShots[0].filename}`;
	}
	
	if (newShots.length >= 2) {
		compileForm.elements.image_below.value = `/${newShots[1].filename}`;
	}
}

readPullForm.onsubmit = (ev) => {
	ev.preventDefault();
	readPull(ev.target.elements.url.value).catch((e) => {
		alert(e);
	});
};
readPullSubmit.disabled = false;
if (document.referrer.startsWith('https://github.com/')) readPullForm.elements.url.value = document.referrer;

compileForm.ratio.value = window.devicePixelRatio;
compileForm.onsubmit = (ev) => {
	ev.preventDefault();

	const action = `https://github.com/${compileForm.elements.owner.value}/${compileForm.elements.repo.value}/new/${compileForm.elements.branch.value}`;
	newForm.action = action;
	newAction.textContent = action;

	const date = getLocalDate(compileForm.elements.date);
	newForm.elements.filename.value = `_posts/${date.getFullYear()}-${('0' + (date.getMonth() + 1)).slice(-2)}-${('0' + date.getDate()).slice(-2)}-${compileForm.elements.slug.value}.md`;
	newForm.elements.value.value = `---
date: ${date.toString().replace('GMT', '')}
image_above: ${compileForm.elements.image_above.value}
image_below: ${compileForm.elements.image_below.value}
ratio: ${compileForm.elements.ratio.value}
ground_truth: ${compileForm.elements.ground_truth.value}
source_url: ${compileForm.elements.source_url.value}
source_name: ${compileForm.elements.source_name.value}
source_published: ${compileForm.elements.source_published.value}
---
`;
	newSubmit.disabled = false;
};
compileSubmit.disabled = false;
