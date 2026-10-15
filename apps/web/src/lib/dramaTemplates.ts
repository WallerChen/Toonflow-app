export type DramaTemplate = { id: string; title: [string, string]; genre: [string, string]; premise: [string, string]; character: string; style: string; beats: { action: string; line: [string, string] }[] };
export const dramaTemplates: DramaTemplate[] = [
  { id: "littleLight", title: ["A little light", "一颗小小的光"], genre: ["Cozy fantasy", "治愈奇幻"], premise: ["A tiny robot turns a forgotten seed into hope.", "小机器人让一颗被遗忘的种子重新发芽。"], character: "A small round brass robot with circular golden eyes, a single antenna and a blue knitted scarf", style: "Cinematic 3D animation, moonlit greenhouse, warm gold against deep blue", beats: [
    { action: "Discovers one glowing seed on a dusty wooden table. Slow push-in.", line: ["Someone left a little light behind.", "有人留下一点光。"] },
    { action: "Gently plants the same glowing seed in a clay pot. Close-up on its hands.", line: ["Maybe it just needs a chance.", "也许，它只需要一次机会。"] },
    { action: "Watches two luminous leaves unfurl, then smiles. Slow pull-back.", line: ["Every tomorrow starts small.", "每个明天，都从小小的开始。"] },
  ] },
  { id: "lastTrain", title: ["The last train", "最后一班车"], genre: ["Romance", "温柔爱情"], premise: ["A missed train brings two strangers together.", "错过末班车的两个人，遇见了彼此。"], character: "A young adult woman with a short black bob, a beige trench coat and a red umbrella", style: "Cinematic live action, rainy station at night, soft practical lighting", beats: [
    { action: "Runs onto the platform as the last train departs. Rain glitters under the lights.", line: ["I thought I had missed everything.", "我以为，我错过了一切。"] },
    { action: "Notices a young adult man in a navy coat returning her dropped ticket.", line: ["You dropped your next beginning.", "你把下一次开始弄丢了。"] },
    { action: "Shares her red umbrella with him as they walk away from the station.", line: ["Perhaps I arrived just in time.", "也许，我来得刚刚好。"] },
  ] },
  { id: "midnightLetter", title: ["The midnight letter", "午夜来信"], genre: ["Mystery", "悬疑反转"], premise: ["A mysterious letter leads back to its own sender.", "一封神秘的信，把主人公带回了自己身边。"], character: "An adult detective with curly dark hair, round glasses and a charcoal coat", style: "Noir mystery, old library, amber desk lamp, gentle tension, no violence", beats: [
    { action: "Finds a sealed envelope beneath an old library door. Close-up without readable text.", line: ["The letter arrived twenty years late.", "这封信，迟到了二十年。"] },
    { action: "Recognizes a small silver key inside and looks toward a locked drawer.", line: ["But I knew this key.", "可我认得这把钥匙。"] },
    { action: "Opens the drawer to find a childhood photograph of the same detective.", line: ["I had been waiting for myself.", "原来，我一直在等自己。"] },
  ] },
  { id: "officeCat", title: ["The new manager", "新来的经理"], genre: ["Comedy", "办公室喜剧"], premise: ["The quietest colleague turns out to run the office.", "办公室里最安静的同事，才是真正的管理者。"], character: "A fluffy orange cat wearing a tiny navy tie", style: "Playful realistic animation, bright contemporary office, clean comic timing", beats: [
    { action: "Sits upright in a large manager chair while an adult employee brings papers.", line: ["The new manager says very little.", "新经理的话特别少。"] },
    { action: "Pushes a stack of paperwork off the desk with one careful paw.", line: ["But the decisions are bold.", "但他的决定，很果断。"] },
    { action: "Curls up on the warm laptop as the employee quietly takes a break.", line: ["Productivity has never felt this peaceful.", "效率，从来没有如此安静。"] },
  ] },
  { id: "moonDelivery", title: ["Delivery to the moon", "送往月球的快递"], genre: ["Sci-fi", "科幻微短剧"], premise: ["A courier discovers what the final parcel contains.", "太空快递员发现最后一件包裹的秘密。"], character: "An adult space courier with freckles, a white flight suit and an orange shoulder patch", style: "Optimistic science fiction, cinematic moon base, soft blue and orange lighting", beats: [
    { action: "Carries one small parcel through a silent lunar station. Earth is visible outside.", line: ["One last delivery, far from home.", "最后一件快递，离家很远。"] },
    { action: "Opens the parcel to reveal a tiny living green plant.", line: ["Some things cannot be sent as a message.", "有些东西，不能只发一条消息。"] },
    { action: "Places the plant beside the station window and watches Earth.", line: ["Home can begin anywhere.", "家的开始，可以在任何地方。"] },
  ] },
  { id: "animePromise", title: ["The lantern promise", "灯笼下的约定"], genre: ["Anime", "动漫冒险"], premise: ["A young adult traveler follows a lantern back to a promise.", "年轻旅人跟着一盏灯，找回旧日的约定。"], character: "A young adult anime traveler with silver hair, a teal cloak and a small brass lantern", style: "Original hand-painted anime aesthetic, floating islands, warm luminous clouds", beats: [
    { action: "Stands at a broken sky bridge holding the lantern. Wide establishing shot.", line: ["I promised I would return.", "我答应过，一定会回来。"] },
    { action: "Raises the lantern as a path of soft lights appears across the gap.", line: ["A promise can become a path.", "约定，也能变成一条路。"] },
    { action: "Reaches a glowing doorway and turns with a relieved smile.", line: ["This time, I found the way.", "这一次，我找到了方向。"] },
  ] },
  { id: "sleepyFox", title: ["The sleepy forest", "困倦的森林"], genre: ["Bedtime", "睡前故事"], premise: ["A little fox helps the forest settle down for the night.", "小狐狸陪森林一起安静入睡。"], character: "A small red fox with a cream muzzle and a soft green scarf", style: "Gentle storybook watercolor animation, calm moonlit forest, slow camera movements", beats: [
    { action: "Walks softly beside a quiet stream, watching fireflies drift.", line: ["The forest is getting sleepy.", "森林开始犯困了。"] },
    { action: "Tucks a fallen leaf beside a resting hedgehog, then smiles.", line: ["Everyone has a place to rest.", "每个人，都有安心休息的地方。"] },
    { action: "Curls beneath a tree as warm fireflies fade into the distance.", line: ["Good night, little world.", "晚安，小小的世界。"] },
  ] },
  { id: "smallShop", title: ["The first customer", "第一位客人"], genre: ["Everyday drama", "生活小剧场"], premise: ["One kind gesture changes the first day of a small shop.", "一个善意的举动，改变了小店开张的第一天。"], character: "An adult baker with curly brown hair, a cream apron and rolled-up sleeves", style: "Warm cinematic realism, neighborhood bakery, soft morning sunlight", beats: [
    { action: "Arranges one perfect loaf behind an empty bakery window.", line: ["The first morning was very quiet.", "开张的第一个早晨，很安静。"] },
    { action: "Offers a small pastry to an older neighbor standing outside.", line: ["So I started with a little kindness.", "于是，我先送出一点善意。"] },
    { action: "Welcomes the neighbor returning with two friends, smiling in the doorway.", line: ["And kindness brought company.", "善意，带来了新的相遇。"] },
  ] },
];
