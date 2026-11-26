// Main story text: "Grandfather's Journals".
// Rules (see docs/shipped-plans.md): the grandparents and his ship are never
// named; the player is the grandchild, addressed as "you" (never he/she);
// {captain} is replaced with the player's chosen name, {n} with a roman
// numeral. Plain ASCII apostrophes throughout.

// Each card: { art, title?, text }. art: 'harbor' | 'boat' | 'wreck' | 'letters' | 'sunset' | 'home'
export const PROLOGUE = [
  {
    art: 'harbor',
    title: 'Port Haven',
    text: "Port Haven wakes to gulls, tar and frying fish. Today, {captain}, the harbor has something for you.",
  },
  {
    art: 'boat',
    text: "Grandma walks you to the end of the pier, where a little boat with a patched sail bobs on its rope. \"Your grandfather always said everyone in this family needs a boat,\" she says. \"This one's yours.\"",
  },
  {
    art: 'wreck',
    text: "\"His own ship is still out on the rocks, just past the point. The old captain never could sit still.\" She squeezes your hand. \"Go and pay your respects.\"",
  },
  {
    art: 'boat',
    text: "Raise the sail, keep the wind across your side, and follow the marker to the wreck. The sea has been waiting for you.",
  },
];

export const JOURNALS = [
  {
    id: 'I',
    title: 'The First Page',
    body: "To whoever finds this book: return it to the old captain at once. There is a reward. (There is no reward.)\n\n" +
      "This is my first journal, the one that lives in the chart table drawer. It is the only one I have never managed to lose. The rest are scattered across the isles, because I have a terrible habit: I write wherever I go, I set the journal down to admire the view, and then I sail off without it. The gulls must be very well read by now.\n\n" +
      "I have sailed farther than anyone in Port Haven thought possible. I have named islands that never had names and outrun storms that made grown sailors weep into their hats. The sea and I understand each other. Mostly.\n\n" +
      "If you have found this, you have probably found my brass spyglass too. It shares the drawer and refuses to stay put. Take it, and do not let it roll overboard. A spyglass is wasted on anyone who is not going somewhere.\n\n" +
      "Fair winds and following seas",
    clue: "My second journal should still be at my very first camp, on a little green island a short sail west of Port Haven. Look for the cairn on the beach.",
  },
  {
    id: 'II',
    title: 'Names for Everything',
    body: "Second week at sea and I have already named eleven islands. One is shaped like a sleeping cat, so it is Cat's Nap. One I named after lunch. That was a mistake, and the cook has not forgiven me.\n\n" +
      "The crew think naming things is vanity. I think a map with blank spaces is a map that isn't finished, and I have never liked leaving a job half done. Except dinner. I always leave dinner half done, because nobody aboard can cook like my wife. Ship's biscuits are just apologies made of flour.\n\n" +
      "Still, there is nothing like the first sight of a new shore at dawn. The whole sea goes pink, the island looks as if it has been waiting just for you, and for one minute you are the only person in the world who knows it is there.\n\n" +
      "I have built a cairn here so I can find this place again. I will almost certainly forget this journal beside it.\n\n" +
      "Onward, always onward",
    clue: "Next I mean to see the great forest far to the west, where the trees are so old they make their own weather. If you follow me, look among the roots.",
  },
  {
    id: 'III',
    title: 'The Oldest Tree',
    body: "The trees here are older than every town on the coast put together. When the wind moves through them they creak like a ship at anchor, which makes me feel right at home.\n\n" +
      "I did a foolish thing today. I climbed the biggest tree in the grove and carved our initials into the bark, my love's and mine, inside a lopsided heart. Then, since I had the knife out anyway, I added a little anchor for the children.\n\n" +
      "The crew laughed. I told them it was a navigational mark. It is not a navigational mark. It is a wobbly heart sixty feet up a tree, where nobody will ever see it but the owls.\n\n" +
      "I don't know why I did it. Something about this place makes a man want to leave proof he was here, and that somebody, somewhere, was on his mind. Or that he was on theirs. It is hard to say which way round it goes.\n\n" +
      "Anyway. The owls approve.\n\n" +
      "Yours, from the top of a very tall tree",
    clue: "From here I sail north, to a great stone arch that stands in the open sea like a doorway with no house behind it. I intend to sail straight through.",
  },
  {
    id: 'IV',
    title: 'The Squall',
    body: "I sailed through the arch. I would like that written down somewhere official.\n\n" +
      "What I would rather not write down is what came after. A squall caught us an hour past the arch, black as ink and twice as fast. The mast groaned, the sail split, and for one long minute I was certain we were going under.\n\n" +
      "In that minute I did not think about treasure or maps or glory. I thought about the kitchen at home. The kettle. The way my love hums when she thinks nobody can hear.\n\n" +
      "We came through, of course. We always do. When the sea calmed I sat down and wrote her a letter, four pages long, saying all the things I never manage to say out loud. Then I folded it up and put it in my chest instead of posting it, because a man who writes a letter like that ought to come home and mean it.\n\n" +
      "I am a coward about very few things. That, it turns out, is one of them.\n\n" +
      "Still afloat, just about",
    clue: "Sailors say there are ruins far to the southeast: a whole temple half drowned among the palms. If anywhere has treasure worth a squall, it is there.",
  },
  {
    id: 'V',
    title: 'Gold and Quiet',
    body: "I found it. The temple, the treasure, the lot. Gold so old it has forgotten what it was for, statues with seaweed beards, and a hall of carved fish who all look slightly disappointed in me.\n\n" +
      "This is the discovery they will sing about. The old captain and the drowned temple. Sailors will tell it in harbor taverns long after I'm gone, and they will get the details wrong, and I will not mind one bit.\n\n" +
      "Tonight the crew are singing on deck, and I came below to write it all down while it is fresh. Every room, every carving, every coin. It is the best page I have ever written.\n\n" +
      "Then I put the pen down and looked around the cabin for somebody to read it to.\n\n" +
      "There is the treasure, and there are the songs, and there is the sea going on and on outside the window. Everything a man could want.\n\n" +
      "And no one to show it to.\n\n" +
      "Richer than ever",
    clue: "Northeast of here stands a mountain that smokes like a kettle left on the stove. I am told the view from its shoulder is worth a pair of singed eyebrows.",
  },
  {
    id: 'VI',
    title: 'Counting',
    body: "The mountain grumbles all night, which is fine, because I was not sleeping anyway. I was counting.\n\n" +
      "Birthdays, mostly. I tried to count the birthdays I have missed at home, and I ran out of fingers, and then I ran out of the cook's fingers too. Harvest suppers. Midwinter. The year the roof leaked and my love fixed it herself and wrote to tell me, as if I could do anything about it from the far side of the world.\n\n" +
      "And the year my grandchild was born. I was here, near enough, watching this mountain spit sparks at the stars, while back home somebody very small was being placed in my wife's arms for the first time.\n\n" +
      "The letter caught up with me three months later. I read it on this very ridge. I remember thinking: I'll be home before the little one can walk.\n\n" +
      "I was wrong about that.\n\n" +
      "Still counting",
    clue: "There is one place left I have never been: an icy spire at the far north, the very top of the chart. The seas up there are rough, so a sturdier hull and a heavier keel would be wise. The water round the spire never sleeps: shorten sail, and turn your bow into the big waves.",
  },
  {
    id: 'VII',
    title: 'The Top of the Map',
    body: "This is it. The top of the map. Ice on the rigging, ice in my beard, ice in the ink. There is nothing north of here except more north.\n\n" +
      "I have done it all now. Every island I meant to find, every storm I meant to beat, every story I meant to bring home. I have the songs and the gold and the charts with my handwriting all over them.\n\n" +
      "And I am cold, and tired, and so far from my own kitchen table that I can't picture it properly anymore. I keep trying. The cups go on the left. Or the right. I can't remember which, and that frightens me more than any squall ever did.\n\n" +
      "None of it was worth that. Not the gold, not the songs, not one single name on one single map.\n\n" +
      "So I have turned the ship around. No more next horizon. I will leave this last journal here for the ice to keep, and then I am done.\n\n" +
      "I am going home.",
    clue: "Every letter I never posted is in the old chest under my bunk. When I get home, I'll hand them over myself and say every word out loud.",
  },
];

export const STEPS = {
  visitWreck: { title: "Grandfather's wreck", text: "Sail out past the point to your grandfather's wreck, climb aboard and search his cabin." },
  journal: { title: "Grandfather's Journals", text: "Follow Grandpa's clue and find Journal {n}." },
  // journals that wait inside an island level, by journal id: you go ashore for them
  ashore: {
    III: {
      text: "Go ashore at the Elder Grove and follow Grandpa's trail. He said to look among the roots.",
      noAnchor: "Grandpa's third journal is ashore at the Elder Grove. You'll need an anchor to land there, and a sounder hull to carry one.",
      where: 'the carving',
    },
    IV: {
      text: 'Go ashore at Archway Isle. He was heading for the arch.',
      noAnchor: "Grandpa's fourth journal is ashore at Archway Isle. You'll need an anchor to land there, and a refit to grip bare rock.",
      noRefit: "Grandpa's fourth journal is ashore at Archway Isle. Your anchor won't grip bare rock there. Ask the shipwright about a refit.",
      where: 'the keystone',
    },
  },
  searchChest: { title: 'The chest under the bunk', text: "Return to Grandpa's wreck near Port Haven, climb aboard and open the old chest under his bunk." },
  letterHome: { title: 'The letter home', text: "Bring Grandpa's letters home to Grandma in Port Haven." },
};

export const LETTERS = {
  title: 'Letters Never Sent',
  body: "A bundle of letters, tied with sailcloth string. The top one is the four-page letter from the squall, and the ink has run where the spray got in. Every one begins the same way: \"My love, I am coming home soon.\"\n\n" +
    "Beneath them is a little book of pressed flowers, one from every island he ever named, each labelled in his crooked hand. On the first page: \"For her, so she can see where I've been.\"\n\n" +
    "One envelope in the bundle is not for Grandma at all. It is addressed, in the same crooked hand, \"To the captain of the crimson sails.\"\n\n" +
    "At the very bottom, folded neatly, are his red scarf and his old pith helmet, with a note pinned to the scarf: \"For my grandchild. These have seen everything. Let them see it all again, with you.\"",
};

export const EPILOGUE = [
  {
    art: 'home',
    text: "Grandma reads the letters on the porch, slowly, twice. The gulls go quiet, as if they are listening too.",
  },
  {
    art: 'wreck',
    text: "\"He was coming home,\" she says at last. \"All those years, and he was a few hours from the harbor.\"",
  },
  {
    art: 'sunset',
    text: "She laughs and wipes her eyes at the same time. \"Of course he wrecked on the one rock he'd sailed past a thousand times. Always watching the horizon instead of the water.\"",
  },
  {
    art: 'letters',
    text: "She ties the red scarf around your neck and sets the old helmet on your head. \"There. Now he gets to see it all again.\"",
  },
  {
    art: 'boat',
    text: "The sea is still out there, {captain}, full of islands nobody has named. Go and find them. Just remember to come home and tell us about them.",
  },
];

export const LINES = {
  spyglassFound: "Grandpa's brass spyglass is yours! Use it to spot islands from far away.",
  journalFound: "Found Grandpa's Journal {n}",
  chestFound: 'Inside the chest: a bundle of letters, tied with string.',
  storyComplete: "Grandfather's Journals: complete",
  spyglassHint: "Grandpa's old spyglass is somewhere in his wreck, just past the point.",
  shipwrightSpyglass: "Find your grandfather's spyglass",
  groveNote: '"Gone up the big tree. Back for supper."',
  groveNoteText: 'His handwriting, in a hurry. A worn path runs inland, towards the great tree.',
  carving: 'A lopsided heart, two sets of initials worn soft by the weather, and a little anchor underneath.',
  flowerCrown: "Somebody wove it and left it at the top of the oldest tree. Try it on at any port's Tailor.",
  archNote: '"Glass dropping. Up to the arch for a look. If it\'s coming, I\'m going through first."',
  archNoteText: 'Pinned to his weather board, under a column of chalked readings, each lower than the last. Little cairns lead up the gully and round the cliff.',
  keystone: 'Scratched into the rock: two initials worn smooth, "SAILED THROUGH", and an arrow pointing out to sea.',
  souwester: "An oilskin storm hat, stiff with salt. Somebody sat out a squall up here. Try it on at any port's Tailor.",
};

// The sea zones (sea-zones.js), by id: the name shown on sailing in, and the warnings
// while you are in rough water.
export const SEAS = {
  home: 'Home waters',
  reach: 'The Frostspire Reach',
  rip: 'The Cinder Rip',
  swell: 'The Outer Swell',
  rough: 'Rough water',
  reef: 'Rough water: reef your sails',
  beating: 'Rough water: hull taking a beating',
  haul: 'Hauled out of rough water!',
  // a rogue wave (rough-water.js): the warning says where it is, by bearingKey() in
  // rogue.js, and changes as you turn; then what came of meeting it
  wave: {
    ahead: 'Big wave dead ahead!', astern: 'Big wave astern!',
    portBow: '◀ Big wave off the port bow!', starboardBow: 'Big wave off the starboard bow! ▶',
    portBeam: '◀ Big wave on the port beam!', starboardBeam: 'Big wave on the starboard beam! ▶',
    portQuarter: '◀ Big wave on the port quarter!', starboardQuarter: 'Big wave on the starboard quarter! ▶',
  },
  // the shipwright, on fitting the hull that landing at Frostspire asks for
  shipwright: 'The shipwright: “That hull will stand the Frostspire Reach. Reef your sails up there, and take the big waves bow-on.”',
  waveOver: 'Bow-on, and over the top.',
  waveBeam: 'The wave caught you side-on!',
  waveSail: 'Too much sail up for a wave like that!',
};

// Report quests (reports.js): you see something at sea, and somebody ashore
// wants it written down. {port} is where they live, {captain} the player's name.
export const REPORTS = {
  archCrabs: {
    sighting: 'Crabs! Upside down, all over the underside of the arch.',
    added: 'Somebody should hear about those crabs. Ask for the naturalist at {port}.',
    title: 'The crabs under the arch',
    text: 'Tell the naturalist at {port} about the crabs living upside down under the arch at Archway Isle. Nobody has ever written them down.',
    label: 'A sighting to report',
    status: 'Tell the naturalist at {port}',
    eyebrow: 'The naturalist at {port}',
    done: "{captain}'s crab",
    pageName: "A page in the naturalist's book",
    page: '"Upside down? All of them? Wait, let me get the book." A whole page, with a drawing, and your name at the top. "{captain}\'s crab. It\'s official now."',
    pinName: 'Crab pin',
    pin: "A little enamel crab for your collar. Find it in the Tailor's wardrobe.",
    gold: 'For the news, and for sailing all this way to tell it.',
  },
  // The living sea (sea-events.js). These go stale after a few days, so `stale`
  // is what the toast says when one does.
  whale: {
    added: 'The cartographer at {port} is charting where the whales go. Tell them while the news is fresh.',
    title: 'News of a whale',
    text: "Tell the cartographer at {port} where you saw the whale. They're charting the migration.",
    label: 'A sighting to report',
    status: 'Tell the cartographer at {port}',
    stale: 'Your news of the whale has gone stale. The next one you see will be worth telling.',
    eyebrow: 'The cartographer at {port}',
    done: 'One for the whale chart',
    pageName: 'A mark on the whale chart',
    page: '"Blowing, you say? And heading which way?" A small whale is inked onto the big chart, with the day beside it.',
    gold: 'For the news, while it was fresh.',
  },
  dolphins: {
    added: 'Dolphins mean a lucky trade run. The merchant at {port} pays for news like that.',
    title: 'News of dolphins',
    text: 'Tell the merchant at {port} about the dolphins. Dolphins on the route mean a lucky run, and merchants pay to hear it.',
    label: 'A sighting to report',
    status: 'Tell the merchant at {port}',
    stale: 'Your news of the dolphins has gone stale. The next pod you see will be worth telling.',
    eyebrow: 'The merchant at {port}',
    done: 'A lucky run',
    pageName: 'Good news for the merchant',
    page: '"Dolphins! On my route?" The merchant sends word to load the next ship a day early.',
    gold: 'For the news, while it was fresh.',
  },
  ghostShip: {
    added: 'The old salt at {port} will want to hear about that ship.',
    title: 'The ghost ship',
    text: 'Tell the old salt at {port} about the pale ship with the green lanterns.',
    label: 'A sighting to report',
    status: 'Tell the old salt at {port}',
    stale: 'Your news of the ghost ship has gone stale. Nobody will believe it now. Maybe next time.',
    eyebrow: 'The old salt at {port}',
    done: "So she's sailing again",
    pageName: "The old salt's story",
    page: '"Green lanterns? And no wake?" The old salt goes quiet for a while. "So she\'s sailing again." Then you are bought supper, to tell it twice.',
    gold: 'For the story, and for telling it twice.',
    main: 'Tell it again',
  },
  turtles: {
    added: 'The cartographer at {port} charts where the turtles travel. Tell them while the news is fresh.',
    title: 'News of sea turtles',
    text: "Tell the cartographer at {port} where you saw the turtles. They're charting the routes the turtles take.",
    label: 'A sighting to report',
    status: 'Tell the cartographer at {port}',
    stale: 'Your news of the turtles has gone stale. The next ones you see will be worth telling.',
    eyebrow: 'The cartographer at {port}',
    done: 'A line on the turtle chart',
    pageName: 'A dotted line across the chart',
    page: '"A whole line of them? All heading the same way?" A row of small dots goes onto the chart, pointing where the turtles were going.',
    gold: 'For the news, while it was fresh.',
  },
  bloom: {
    added: 'The naturalist at {port} has waited years to hear of the glowing sea.',
    title: 'The glowing sea',
    text: 'Tell the naturalist at {port} about the night the sea glowed blue.',
    label: 'A sighting to report',
    status: 'Tell the naturalist at {port}',
    stale: 'Your news of the glowing sea has gone stale. It will have faded by now.',
    eyebrow: 'The naturalist at {port}',
    done: 'A jar of seawater',
    pageName: "A page in the naturalist's book",
    page: '"Blue? And your wake too?" The naturalist writes down every word, then runs out with a jar to look for it tonight.',
    gold: 'For the news, while it was fresh.',
  },
  iceberg: {
    added: 'Loose ice sinks ships. The harbormaster at {port} needs to know.',
    title: 'An ice warning',
    text: 'Tell the harbormaster at {port} where the iceberg broke up, so other ships can be warned.',
    label: 'A sighting to report',
    status: 'Tell the harbormaster at {port}',
    stale: 'Your ice warning is stale. The ice will have drifted off by now.',
    eyebrow: 'The harbormaster at {port}',
    done: 'A warning posted',
    pageName: 'A pin in the harbor chart',
    page: '"Loose ice? Out there?" A pin goes into the harbor chart, and a lookout is sent up the tower.',
    gold: 'For the warning. It may save a ship.',
  },
  waterspout: {
    added: 'The harbormaster at {port} posts warnings for other ships. Tell them about the waterspout.',
    title: 'A waterspout warning',
    text: 'Tell the harbormaster at {port} where you saw the waterspout, so other ships can be warned.',
    label: 'A sighting to report',
    status: 'Tell the harbormaster at {port}',
    stale: 'Your waterspout warning is stale. That storm has long blown through.',
    eyebrow: 'The harbormaster at {port}',
    done: 'A warning posted',
    pageName: 'A notice on the harbor wall',
    page: '"A spout? Out there?" A warning is chalked up on the harbor wall before you have finished telling it.',
    gold: 'For the warning. It may save a ship.',
  },
  // the first bottle you open holds a letter to carry; it keeps, however long you take
  bottle: {
    added: 'The letter from the bottle is addressed to the harbormaster at {port}.',
    title: 'A letter from a bottle',
    text: 'Carry the letter you found in the bottle to the harbormaster at {port}. It has been at sea a long time.',
    label: 'A letter to deliver',
    status: 'Take the letter to the harbormaster at {port}',
    eyebrow: 'The harbormaster at {port}',
    done: 'Delivered at last',
    pageName: 'A very late letter',
    page: '"I know this hand." The harbormaster reads it twice, standing up. "The catch was good, and home by supper. That was forty years ago. Nobody here ever could resist a bottle."',
    gold: 'Postage, forty years late.',
  },
};

// The living sea (sea-events.js): what you're told when something turns up,
// and the cards in the journal's Sightings tab. {side} is "left" or "right".
export const SIGHTINGS = {
  whale: {
    name: 'A whale',
    hint: 'Seen in cool and cold water, when there is no storm.',
    cue: 'A spout of mist, ahead to the {side}!',
    tip: 'Sail slowly alongside and the whale will stay up with you.',
    about: 'It blows, it breaches, and it goes down with a flick of its tail.',
    wanted: 'a whale',
  },
  dolphins: {
    name: 'Dolphins',
    hint: 'Seen in warm water on a fine day.',
    cue: 'Something is leaping, ahead to the {side}!',
    tip: 'Sail fast and the dolphins will ride your bow wave.',
    about: 'Sail fast near a pod and they ride your bow wave, and pull you along.',
    wanted: 'dolphins',
  },
  turtles: {
    name: 'Sea turtles',
    hint: 'Seen in warm southern water, by day.',
    cue: 'Small heads in the water, ahead to the {side}.',
    tip: "Sail slowly and you can pass among them. Mind you don't bump one.",
    about: 'A slow line of them, coming up for air. Go gently and they let you pass.',
    wanted: 'sea turtles',
  },
  bottle: {
    name: 'A message in a bottle',
    hint: 'Something small that glints on the water. It could be anywhere.',
    cue: 'Something glints on the water, ahead to the {side}.',
    tip: 'Stop beside it and haul it up.',
    about: 'Somebody threw it in, a long time ago. Stop and haul one up to see what it says.',
  },
  bloom: {
    name: 'The glowing sea',
    hint: 'Seen in warm water, at night.',
    cue: 'The water is glowing, ahead to the {side}.',
    tip: 'Sail through it and look behind you.',
    about: 'On some warm nights the sea lights up blue, and so does your wake.',
    wanted: 'the glowing sea',
  },
  iceberg: {
    name: 'An iceberg breaking up',
    hint: 'Seen in the cold north.',
    cue: 'Ice, ahead to the {side}!',
    tip: 'Keep clear. The pieces it sheds will hole a hull.',
    about: 'A slab splits off with a crack like thunder, and leaves loose ice in the water for a while.',
    wanted: 'an iceberg breaking up',
  },
  waterspout: {
    name: 'A waterspout',
    hint: 'Seen in storms.',
    cue: 'A waterspout, ahead to the {side}! Steer clear!',
    tip: 'Stay well away from it. It wanders.',
    about: 'A spinning column of water under a storm cloud. Steer round it.',
  },
  ghostShip: {
    name: 'The ghost ship',
    hint: 'Seen at night. More often in fog.',
    cue: 'A pale green light, ahead to the {side}.',
    tip: 'Follow her if you dare, but not too close.',
    about: 'She makes no sound and leaves no wake. Follow her, but keep your distance.',
    wanted: 'the ghost ship',
  },
  archCrabs: {
    name: 'The crabs under the arch',
    hint: 'Sail through a great stone arch and look up.',
    about: 'They live upside down on the underside of the arch at Archway Isle.',
  },
  first: 'First sighting',
  again: 'Sighting number {n}',
  unseen: 'Not yet seen',
  count: 'Seen {n} times',
  countOnce: 'Seen once',
  firstSeen: 'First seen on day {day}',
  intro: 'What you have seen out at sea. Sail close, or hold it in the spyglass for a moment, and it goes in the book.',
  toGo: '{n} of {of} towards the {item}',
  earned: 'You earned the {item}',
  news: 'News to tell at {port}',
  ride: 'The dolphins are riding your bow wave. They pull you along!',
  rideEnd: 'The dolphins peel away.',
  tooClose: 'The ghost ship fades as you come close.',
  dawn: 'The ghost ship fades with the first light.',
  led: 'The ghost ship fades. Something glints on the water where she stopped.',
  cachePrompt: 'Haul up what the ghost ship left',
  cacheSlow: 'Slow down to haul it up',
  cacheTitle: '{gold} gold',
  cacheSub: 'An old strongbox, left by the ghost ship',
  turtlesBump: 'You bumped a turtle! They all dive.',
  turtlesFast: 'Too fast. The turtles dive.',
  turtleFriend: 'One of the turtles swims along beside you.',
  bloomIn: 'The sea glows blue around you. Look at your wake!',
  calve: 'The iceberg is breaking up!',
  bottlePrompt: 'Haul up the bottle',
  bottleSlow: 'Slow down to pick up the bottle',
  hitIce: 'Crunch! You struck the ice.',
  hitSpout: 'The waterspout batters your hull!',
  hitWhale: 'Thump! You ran into the whale.',
  hitBreach: 'The whale comes up against your hull!',
  rewardEyebrow: 'Sightings',
  rewards: {
    whale: { title: 'Five whales', text: "A whale's tail carved from driftwood, on a cord. For someone the whales have got used to. Find it in the Tailor's wardrobe." },
    ghostShip: { title: 'Three times, the ghost ship', text: "It was hanging from your own mast this morning: a sailor's cap with a little green lantern on it. Find it in the Tailor's wardrobe." },
  },
};

// Grandfather's anchor, refitted one piece at a time (refits.js). Index by
// tier: 1 grapnel arms, 2 coral flukes, 3 tempered chain, 4 ice spikes.
// {place} is the island whose vault holds the fitting.
export const REFIT = {
  // shown by a shore you can't land on yet, by biome
  cantLand: {
    rocky: "Your anchor won't grip bare rock. Ask the shipwright.",
    tropical: 'Your anchor drags in the coral sand. Ask the shipwright.',
    volcanic: 'The heat here would soften your anchor chain. Ask the shipwright.',
    cold: 'Your anchor would skid on the ice. Ask the shipwright.',
  },
  tiers: [
    null,
    {
      item: 'Old iron fitting',
      offer: "\"That rudder will take you in among the sea stacks, but your grandfather's anchor won't grip bare rock. Bring me an old iron mooring fitting and I'll forge grapnel arms onto it. There's one at the top of {place}.\"",
      fitted: 'Four arms now, to hook bare rock. You can land on rocky islands, and from a little further out.',
    },
    {
      item: 'Bronze casting',
      offer: "\"A hull like that can take the reefs, but your anchor slides through coral sand. Broad flukes would hold. There's an old bronze casting up on {place} I can shape into them.\"",
      fitted: 'Broad flukes that bite in coral sand. You can land on tropical islands, and drop anchor at a faster clip.',
    },
    {
      item: 'Old chain links',
      offer: "\"With that keel you'll ride out the swells round the fire islands, but the heat there softens plain iron. I can temper you a chain if you bring me the old links from the top of {place}.\"",
      fitted: 'A dark, tempered chain that shrugs off heat. You can land on volcanic islands, and your anchor holds in a storm.',
    },
    {
      item: 'Fire-forged spikes',
      offer: "\"A hull that strong can push through the ice floes. Ice needs spikes, and the best are forged in fire. Someone left a set at the top of {place}.\"",
      fitted: "Spikes to grip the ice, and the whole anchor gilded while I was at it. It's still his anchor, just one that has been everywhere.",
    },
  ],
  questTitle: 'Refit: {label}',
  questFetch: 'Climb {place} and bring the {item} back to any shipwright.',
  questBring: 'Bring the {item} to any shipwright to have the {label} fitted.',
  questGiver: 'Opens {biome} islands',
  needGold: 'The shipwright needs {gold} gold to fit the {label}.',
  maxed: 'It has been everywhere.',
  notYet: 'Nothing more to fit yet.',
};

// "Sighting wanted" on the quest boards (quests.js). {what} is a kind's
// `wanted` above, {hint} its `hint`.
export const BOUNTY = {
  title: 'Sighting wanted: {what}',
  text: 'There is talk of {what} {dir} of here, about {dist} out. Go and see for yourself, then tell any harbor. {hint}',
  search: 'Look for {what} here',
  seen: 'You saw {what}, as asked. Tell any port for your reward.',
};

// What turns up in a bottle (sea-events.js): first a letter to carry, then
// charts of islands you haven't found and scraps of other people's lives, turn
// about. {port} and {place} are filled in.
export const BOTTLES = {
  eyebrow: 'A message in a bottle',
  letter: { title: 'A letter, sealed with wax', name: 'For the harbormaster at {port}', text: 'The paper inside is dry. It is folded small, sealed, and addressed in faded ink. Somebody ought to deliver it.', main: "I'll take it" },
  chart: { title: 'A scrap of a chart', name: '{place}', text: 'Somebody drew an island and threw the drawing in the sea. It matches nothing on your chart, so you copy it in: {place}.' },
  note: { title: 'A note in a bottle', name: 'It says:' },
  notes: [
    'In a crooked hand you know: "Testing whether bottles really do float home. If this reaches Port Haven, tell my wife I was right."',
    'If you are reading this, the bottle floats, and I have won a bet with my brother.',
    'I am seven. I live at Lanternfall. Please write back. I do not know how you would.',
    'Day forty at sea. I have named the gull that follows us. The crew say this is a bad sign.',
    'Reward offered for one hat, blown overboard off Northwatch. It was a very good hat.',
    'The soup at Brightwater is not as good as they say. Go anyway.',
    'Went west. Found more sea. I am told there is more beyond it.',
  ],
};

// The ghost ship's side chain (ghost-chain.js): see her three times, follow
// her to where she is going, and find her captain's log ashore. {place} is the
// island she makes for.
export const GHOST_LOG = {
  begin: 'Three times now. Next time you see the ghost ship, follow her all the way and see where she is going.',
  fades: 'The ghost ship fades off {place}. She was making for the shore.',
  title: "The ghost ship's captain",
  text: 'The ghost ship was making for {place}. Go ashore there and climb to the top. Something of hers may still be there.',
  noAnchor: 'The ghost ship was making for {place}. You will need an anchor that holds there before you can go ashore.',
  status: 'Go ashore and climb {place}',
  search: 'Search near {place}',
  label: 'Where is she going?',
  item: "Captain's log",
  found: {
    eyebrow: 'At the top of {place}',
    title: "The captain's log",
    text: "A ship's log wrapped in oilskin, dry as the day it was put away. Tucked in the back is the crew's pay, never drawn.",
    gold: 'It would be a shame to leave it for the gulls.',
    main: 'Read the log',
  },
  cards: [
    { art: 'ghost', title: "The captain's log", text: 'The last pages are in a careful hand, and the ink has gone green.' },
    { art: 'ghost', text: '"A day from home, and the harbor light in sight. I have promised the crew they will sleep ashore tonight. I have promised it every night this week."' },
    { art: 'ghost', text: '"The light went out an hour ago. Fog, or the keeper asleep. I will not take her in blind onto the rocks. We stand off until we see it lit again."' },
    { art: 'sunset', text: 'That is the last line. She is standing off still, waiting for a light to bring her in. Perhaps that is why she fades when a ship comes close with its lantern lit: it is never the light she is looking for.' },
  ],
  // on her card in the Sightings tab
  cardFollow: 'You have seen her three times. Next time, follow her all the way.',
  cardIsland: 'She was making for {place}.',
  cardDone: "You found her captain's log.",
  read: 'Read the log again',
};
