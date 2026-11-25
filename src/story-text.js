// Main story text: "Grandfather's Journals".
// Rules (see docs/feature-plan.md): the grandparents and his ship are never
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
    clue: "There is one place left I have never been: an icy spire at the far north, the very top of the chart. The seas up there are rough, so a sturdier hull and a heavier keel would be wise.",
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
};
