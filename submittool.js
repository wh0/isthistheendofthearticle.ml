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
	if (o.type === 'text') {
		o.value = d.toString();
	} else {
		o.valueAsNumber = d.getTime() - new Date(1970, 0).getTime();
	}
}

function getLocalDate(o) {
	if (o.type === 'text') {
		return new Date(o.value);
	} else {
		return new Date(new Date(1970, 0).getTime() + o.valueAsNumber);
	}
}

const readPullForm = document.getElementById('read-pull');
const readPullSubmit = document.getElementById('read-pull-submit');
const continueForm = document.getElementById('continue');
const continueSubmit = document.getElementById('continue-submit');
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

	continueForm.elements.owner.value = pull.head.repo.owner.login;
	continueForm.elements.repo.value = pull.head.repo.name;
	continueForm.elements.branch.value = pull.head.ref;
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

	const posts = await fetchApi(`/repos/${pull.head.repo.owner.login}/${pull.head.repo.name}/contents/_posts?ref=${pull.head.ref}`);
	continueForm.elements.post.innerHTML = '';
	for (let i = posts.length - 1; i >= 0; i--) {
		const post = posts[i];
		const option = document.createElement('option');
		option.value = post.name;
		option.textContent = post.name;
		continueForm.elements.post.appendChild(option);
	}
}

readPullForm.onsubmit = (ev) => {
	ev.preventDefault();
	readPull(ev.target.elements.url.value).catch((e) => {
		console.error(e);
		alert(e);
	});
};
readPullSubmit.disabled = false;
if (document.referrer.startsWith('https://github.com/')) readPullForm.elements.url.value = document.referrer;

const PATTERN_POST = /(\d+)-(\d+)-(\d+)-(([\w-]+?)(-\d+)?)\.md/i;

async function loadContinuation(owner, repo, branch, post) {
	const m = PATTERN_POST.exec(post);
	if (m === null) throw new Error('post doesn\'t match pattern');
	const [, year, month, day, slug, slugNoNumber, number] = m;

	const file = await fetchApi(`/repos/${owner}/${repo}/contents/_posts/${post}?ref=${branch}`);
	if (file.encoding !== 'base64') throw new Error('unknown encoding ' + file.encoding);
	const md = atob(file.content);
	const frontMatter = md.split('---\n')[1].split('\n');
	frontMatter.pop();
	const fields = {};
	for (const line of frontMatter) {
		const [k, v] = line.split(': ');
		fields[k] = v;
	}

	const newSlug = number ? slugNoNumber + (number - 1) : slugNoNumber + '-2';
	const fromId = `/${year}/${month}/${day}/${slug}`;
	compileForm.elements.slug.value = newSlug;
	if ('ratio' in fields) compileForm.elements.ratio.value = fields.ratio;
	if ('source_url' in fields) compileForm.elements.source_url.value = fields.source_url;
	if ('source_name' in fields) compileForm.elements.source_name.value = fields.source_name;
	if ('source_published' in fields) compileForm.elements.source_published.value = fields.source_published;
	compileForm.elements.hidden.checked = true;
	compileForm.elements.continued_from.value = fromId;
}

continueForm.onsubmit = (ev) => {
	ev.preventDefault();
	loadContinuation(
		ev.target.elements.owner.value,
		ev.target.elements.repo.value,
		ev.target.elements.branch.value,
		ev.target.elements.post.value,
	).catch((e) => {
		console.error(e);
		alert(e);
	});
};
continueSubmit.disabled = false;

compileForm.ratio.value = window.devicePixelRatio;
compileForm.onsubmit = (ev) => {
	ev.preventDefault();

	const action = `https://github.com/${compileForm.elements.owner.value}/${compileForm.elements.repo.value}/new/${compileForm.elements.branch.value}`;
	newForm.action = action;
	newAction.textContent = action;

	const date = getLocalDate(compileForm.elements.date);
	const maybeHidden = compileForm.elements.hidden.checked ? 'hidden: true\n' : '';
	const maybeContinuedFrom = compileForm.elements.continued_from.value ? `continued_from: ${compileForm.elements.continued_from.value}\n` : '';
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
${maybeHidden}${maybeContinuedFrom}---
`;
	newSubmit.disabled = false;
};
compileSubmit.disabled = false;
