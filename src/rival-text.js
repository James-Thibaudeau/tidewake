// The rival captain: everything Sable says, the quest steps and story cards.
// Rules (see docs/feature-plan.md): the grandparents are never named. To
// Sable he is "your grandfather" or "the old captain"; Sable's grandmother is
// "the captain of the crimson sails". Nothing assumes the player's gender,
// and Sable is "they". {captain} is the player's chosen name; {place}, {dir},
// {a} and {b} are filled in by rival.js. Plain ASCII apostrophes throughout.

export const SPEAKER = 'Captain Sable';

// Sable's look: a fixed profile for the explorer rig, and the sloop's colours.
export const CRIMSON = '#b81f2e';
export const SABLE_PROFILE = {
  name: 'Sable',
  skin: 's6',
  head: 'heart',
  eyes: { color: 'grey', shape: 'sharp' },
  hair: { style: 'ponytail', color: 'black' },
  face: { blush: false, freckles: true },
  hat: { style: 'rivalTricorn', color: 'charcoal' },
  top: { style: 'coat', color: 'crimson', shirt: 'cream' },
  bottom: { style: 'trousers', color: 'charcoal' },
  boots: { style: 'tall', color: 'leather' },
  neck: { style: 'neckerchief', color: 'cream' },
  extra: { style: 'none', color: 'tan' },
};
export const SABLE_LIVERY = { hull: '#1d1a22', trim: CRIMSON, deck: '#b98a58', sail: CRIMSON, flag: '#f4efe4', pennant: CRIMSON };

/**
 * One entry per encounter, in story order.
 *   rumour  what harbor folk say when the encounter is ready (null: Sable finds you)
 *   step    the quest tracker's title and text
 *   hail    Sable's lines when you meet
 *   prompt  the action that starts it
 *   win / lose  Sable's lines after the race (from the player's point of view)
 *   after   lines said either way: what you learn about Sable
 *   learned the same, as a line for the journal
 *   gold    paid for a win
 */
export const ENCOUNTERS = [
  {
    id: 'bows', kind: 'sprint', title: 'Crossed bows', gold: 60,
    rumour: null,
    step: { title: 'Crimson sails', text: 'A sloop with crimson sails is cutting across your bow. See what its captain wants.' },
    hail: [
      "Ahoy! That's the old captain's spyglass on your belt. I'd know that brass anywhere.",
      "So you're the grandchild. I'm Sable. My grandmother chased your grandfather across every sea on the chart.",
      "Race me to the point. Let's see if it runs in the family.",
    ],
    prompt: 'Race Sable to the point',
    win: ["Ha! Beaten by a patched sail. Don't get used to it, {captain}."],
    lose: ["Close! Well, close-ish. Don't sulk. Your grandfather lost his first one to my grandmother too."],
    after: ["I know all about the old captain. I was raised on him. You'll be seeing me again: crimson sails, you can't miss them."],
    learned: 'Sable knows exactly who your grandfather was. They were raised on stories about him.',
  },
  {
    id: 'open', kind: 'buoys', title: 'Open water', gold: 120,
    rumour: 'A sloop with crimson sails has been tacking back and forth between {a} and {b}. Waiting for someone, by the look of it.',
    step: { title: 'Open water', text: 'Crimson sails were seen between {a} and {b}. Find Sable out on the open water.' },
    hail: [
      "There you are! I was starting to think you'd stayed in the harbor.",
      "Three buoys, in order. The wind won't do you any favors on the second leg, so read it.",
      "They did this for forty years, you know. Your grandfather and my grandmother. Neither would let the other win twice running.",
    ],
    prompt: 'Race Sable round the buoys',
    win: ["Forty years of this, and now I'm losing to the next one along. Grandmother would be furious."],
    lose: ["That's one for the crimson sails! She kept a tally on the cabin wall. I've just added a mark."],
    after: ["She'd have liked you, I think. Don't tell anyone I said so."],
    learned: "Your grandfather and Sable's grandmother raced each other across the isles for forty years.",
  },
  {
    id: 'hill', kind: 'summit', title: 'King of the hill', gold: 150,
    rumour: 'Crimson sails, anchored off {place}. Whoever it is has been ashore all day, looking up at the hill.',
    step: { title: 'King of the hill', text: 'Sable has anchored off {place}. Drop anchor there and go ashore.' },
    hail: [
      "Took your time dropping anchor! I've been ashore long enough to get bored.",
      "First to the top. I've no crew to slow me down. Never had one. A crew wants feeding, and paying, and stopping.",
      "Come over here when you're ready.",
    ],
    prompt: 'Race Sable to the summit',
    win: ['All right... you can climb... give me a moment.'],
    lose: ['Top of the hill! Look at that view, {captain}.'],
    after: ["It's quiet up here, isn't it. It's always quiet on my ship. I used to think I liked that."],
    learned: 'Sable sails alone. They have never had a crew.',
  },
  {
    id: 'fog', kind: 'fog', title: 'Fog run', gold: 200,
    rumour: 'Some mad sailor in a red-sailed sloop is setting bell buoys in the fog banks off {place}.',
    step: { title: 'Fog run', text: 'Sable is setting buoys in the fog off {place}. Go and find out why.' },
    hail: [
      'Can you even see me? Good. That is the idea.',
      'Three bell buoys in the fog. No beams and no chart marks. Just your compass, and that spyglass if you are clever.',
      "I know these rocks. I had to learn them. Everything I own is this sloop, so I can't afford to scratch her.",
    ],
    prompt: 'Race Sable through the fog',
    win: ["Through the fog and ahead of me. I'm impressed, and I don't like it."],
    lose: ['Mine! You sailed that blind better than most, though.'],
    after: ["Do you know what she cost me? The house. Grandmother's house, on the hill above the harbor. A house can't win a race. That's what I told myself."],
    learned: "Sable sold their family home to buy the sloop. It was their grandmother's house.",
  },
  {
    id: 'relics', kind: 'relics', title: 'Relic scramble', gold: 250,
    rumour: 'That crimson sloop went by, heading for {place}. The captain was asking about old carvings.',
    step: { title: 'Relic scramble', text: 'Sable is hunting old carvings on {place}. Drop anchor there and go ashore.' },
    hail: [
      'There are old carvings all over this island. Little stone idols. First to find three wins.',
      "I've collected things like these for years. I've nowhere to put them, mind. They roll about in the hold.",
      "Come over here when you're ready.",
    ],
    prompt: 'Start the relic scramble',
    win: ["Three! Fine, fine. Keep them. You've got a shelf to put them on."],
    lose: ['Three for me! More ballast for the hold.'],
    after: ["I've never once been back, you know. To my home port. Not since I sailed. I'm not sure I'd remember which pier is ours."],
    learned: 'Sable has never once been back to their home port.',
  },
  {
    id: 'mast', kind: 'tow', title: 'Dismasted', gold: 0,
    rumour: 'The storm took a mast off somebody last night. A fishing boat saw crimson canvas in the water, far out to the {dir}.',
    step: { title: 'Dismasted', text: 'Crimson canvas was seen in the water far out to the {dir} of {place}. Somebody may need help.' },
    towStep: { title: 'Dismasted', text: "Tow Sable's sloop to a port. You're slower with a ship behind you." },
    hail: [
      '...{captain}? Of all the sails on all the sea.',
      "The storm took my mast in the night. I've been drifting ever since. Don't say anything.",
      "I can't ask my crew for help. I haven't got one. So I'm asking you. Throw me a line?",
    ],
    prompt: 'Throw Sable a line',
    towing: ["You're slower with me behind you. I'd have left me. That's the difference between us, I suppose."],
    learned: "Sable doesn't know what they would do if they stopped racing.",
  },
];

export const LETTER = {
  step: { title: 'A letter for Sable', text: 'Sable is refitting at {place}. Something of your grandfather\'s may yet turn up with their family\'s name on it.' },
  stepReady: { title: 'A letter for Sable', text: 'One of Grandpa\'s unsent letters is addressed to the captain of the crimson sails. Bring it to Sable at {place}.' },
  found: { name: 'A letter for another captain', text: 'One envelope in the bundle isn\'t for Grandma. Bring it to Sable.' },
};

export const DEEP = {
  name: 'The Deep',
  waitStep: { title: 'The Deep', text: 'Sable has sailed for the Deep with the letter unread. Watch the horizon at dusk.' },
  flareStep: { title: 'The Deep', text: "That was Sable's distress flare. Make for the Deep!" },
  flareBanner: ['A distress flare!', 'Crimson, far out over the Deep'],
  arrive: [
    "{captain}! Don't come any closer! It's got hold of the keel!",
    '...No. Come closer. Please. Mind the arms!',
  ],
  tip: 'Dark water and bubbles mean an arm is about to come down. Steer through the gaps.',
  tipLantern: 'A bright light makes the arms flinch.',
  lineFast: ["Line's fast! Pull, pull! Make for the shallows!"],
  caught: ['It only tossed you back! It wants the ship, not you. Come in again!'],
  towStep: { title: 'The Deep', text: 'Tow Sable out of the Deep. The kraken can\'t follow into the shallows.' },
};

// Story cards. art: one of ui.js STORY_ART ('harbor' | 'boat' | 'wreck' | 'letters' | 'sunset' | 'home' | 'sloop' | 'deep')
export const CARDS = {
  mast: [
    { art: 'sloop', title: 'Dismasted',
      text: 'You bring the sloop in on the end of a rope, her broken mast trailing canvas. Nobody on the pier laughs. Sable notices that.' },
    { art: 'harbor',
      text: "\"I've won more races than anyone alive,\" Sable says, watching the shipwrights lift the new mast. \"Lately I've wondered what I'd do if I stopped. I honestly don't know. I've never tried it.\"" },
    { art: 'sloop',
      text: "\"Thank you for the tow, {captain}. I'll be here a while, refitting. If you ever find anything of the old captain's with my family's name on it... well. You'd know where I am.\"" },
  ],
  letter: [
    { art: 'letters', title: 'The other letter',
      text: "At the bottom of the bundle was one envelope that wasn't for Grandma. In your grandfather's crooked hand: \"To the captain of the crimson sails.\"" },
    { art: 'sloop',
      text: "Sable turns it over twice and doesn't open it. \"He wrote to her? He never wrote to anyone. She would have... no. Not now. I've one more thing to do first.\"" },
    { art: 'sunset',
      text: "\"There's a trench past the edge of the old charts. They call it the Deep. She never crossed it, and neither did he. If I do, I've beaten them both. Then I'll read your letter.\" The crimson sails are gone on the evening tide." },
  ],
  finale: [
    { art: 'deep', title: 'The shallows',
      text: 'In the shallows the water goes still. Far behind you, something enormous turns over once and sinks back into the Deep.' },
    { art: 'letters',
      text: 'Sable sits down on the deck, soaked through, and at last opens the letter. They read it properly this time, lips moving.' },
    { art: 'letters',
      text: "\"To the captain of the crimson sails. You were always the faster. I only ever won when you let me, and I knew it, and I never said. Go home sometimes. I should have. Yours, from the slow boat.\"" },
    { art: 'sunset',
      text: "Sable folds it very small. \"She kept every one of his race flags, you know. I thought it was to gloat.\" A long breath. \"I think I'd like to see my own harbor again. Would you come and race me there? Just for fun, this time.\"" },
    { art: 'sloop',
      text: "They take off their hat and set it on your head. \"For the tow. Both of them. And have the crimson for your sails, {captain}. It suits a friend of the family.\"" },
  ],
};

export const REWARDS = {
  eyebrow: 'The rival captain: complete',
  title: "Sable's thanks",
  hat: { name: "Sable's tricorn", text: "You're wearing it. Find it in the Tailor's wardrobe any time." },
  sails: { name: 'Crimson sails', text: "Dye your sails crimson, or change them back, at any port's Shipwright." },
  honour: { name: 'Title: Lifeline', text: 'For going into the Deep after a rival, and coming out with a friend.' },
};
export const TITLE = 'Lifeline';

// After the finale Sable turns up at ports.
export const FRIEND = {
  lines: [
    '{captain}! Pull up a bollard. I have been telling everyone about the kraken. It gets bigger every time.',
    "I went home, you know. The pier is the third one along. I'd have got it wrong.",
    "I've taken on a ship's cat. It counts as crew. Don't laugh.",
    'Fancy a race? No stakes. All right, small stakes.',
  ],
  card: { title: 'Captain Sable is in port', text: 'The crimson sloop is tied up along the pier. Sable is up for a rematch of any of your old races, for a small purse.' },
  rematchGold: 80,
  rematchWin: ['Yours! I am out of practice at losing. I rather like it.'],
  rematchLose: ['Mine! Same again tomorrow?'],
};

export const LINES = {
  questRole: 'The rival captain',
  rumourEyebrow: 'Harbor talk',
  rumourTitle: 'Crimson sails',
  sighted: 'Crimson sails ahead!',
  left: 'You left the race. Sable will find you again.',
  wrecked: 'The race is off. Sable will find you again.',
  towLost: "The tow line parted. Sable's sloop is adrift where you found her.",
  towSlow: 'Towing: your ship is slower',
  dye: { on: 'Sails: Crimson', off: 'Sails: Standard' },
  record: 'Races with Sable: {wins} won, {losses} lost',
};
