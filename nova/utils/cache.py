import os
import json
import subprocess
import xml.etree.ElementTree as ET
from collections import OrderedDict
from typing import List, Tuple, Dict, Any, Optional


# ------------------- Utility Functions -------------------

def fetch_ui_xml(save_path: str = "/sdcard/ui.xml") -> str:
    """Fetch current screen XML from emulator using adb."""
    subprocess.run(
        ["adb", "shell", "uiautomator", "dump", "--compressed", save_path],
        check=True,
    )
    result = subprocess.run(
        ["adb", "shell", "cat", save_path],
        capture_output=True,
        text=True,
        check=True,
    )
    return result.stdout


def parse_ui_xml(xml_str: str) -> List[Tuple[str, int, int, int, int]]:
    """Parse UI XML into a Screen Bag of Words [(text, x1, y1, x2, y2)]."""
    bow = []
    root = ET.fromstring(xml_str)
    for node in root.iter("node"):
        text = node.attrib.get("text", "") or node.attrib.get("content-desc", "")
        bounds = node.attrib.get("bounds", "")
        if not bounds:
            continue
        # bounds looks like: [x1,y1][x2,y2]
        try:
            parts = bounds.replace("][", ",").replace("[", "").replace("]", "").split(",")
            x1, y1, x2, y2 = map(int, parts)
            bow.append((text.strip(), x1, y1, x2, y2))
        except Exception:
            continue
    return bow


def jaccard_similarity(set1: set, set2: set) -> float:
    """Compute Jaccard similarity between two sets."""
    if not set1 or not set2:
        return 0.0
    return len(set1 & set2) / len(set1 | set2)


# ------------------- Similarity Logic -------------------

class CacheSimilarity:
    """Handles similarity comparison between cache entries."""

    predefined_bow = {"click", "button", "icon", "field", "back", "type"}

    @staticmethod
    def build_action_bow(action: str, screen_bow: List[Tuple[str, int, int, int, int]]) -> set:
        """Build action_bow from action string and screen_bow texts."""
        tokens = set(action.lower().split())
        bow = set()
        for tok in tokens:
            if tok in CacheSimilarity.predefined_bow:
                bow.add(tok)
        # Also check if tokens match any text from screen
        screen_texts = {t.lower() for (t, *_coords) in screen_bow if t}
        bow |= tokens & screen_texts
        return bow

    @staticmethod
    def is_similar(
        screen_bow1: List[Tuple[str, int, int, int, int]],
        action_bow1: set,
        screen_bow2: List[Tuple[str, int, int, int, int]],
        action_bow2: set,
        screen_thresh: float = 0.5,
        action_thresh: float = 0.5,
    ) -> bool:
        """Check if two cache entries are similar enough to count as a hit."""
        # Compare action similarity
        action_sim = jaccard_similarity(action_bow1, action_bow2)
        # Compare screen similarity using overlap in texts
        texts1 = {t.lower() for (t, *_c) in screen_bow1 if t}
        texts2 = {t.lower() for (t, *_c) in screen_bow2 if t}
        screen_sim = jaccard_similarity(texts1, texts2)

        print(f'Action similarity ({action_sim}) - Screen similarity ({screen_sim})')
        return action_sim >= action_thresh and screen_sim >= screen_thresh


# ------------------- Replacement Policy (LRU) -------------------

class LRUCachePolicy:
    def __init__(self, capacity: int):
        self.capacity = capacity
        self.cache = OrderedDict()

    def get(self, key: str) -> Optional[dict]:
        if key in self.cache:
            self.cache.move_to_end(key)  # mark as recently used
            return self.cache[key]
        return None

    def put(self, key: str, value: dict):
        if key in self.cache:
            self.cache.move_to_end(key)
        self.cache[key] = value
        if len(self.cache) > self.capacity:
            self.cache.popitem(last=False)  # remove LRU

    def items(self):
        return self.cache.items()


# ------------------- Main Cache Class -------------------

class PersistentActionCache:
    def __init__(self, cache_file: str, capacity: int, policy: str = "lru"):
        self.cache_file = cache_file
        self.capacity = capacity
        if policy.lower() == "lru":
            self.policy = LRUCachePolicy(capacity)
        else:
            raise NotImplementedError("Only LRU policy implemented")

        self._load_from_disk()

    def printCache(self):
        print('\n-------- cache -------')
        for key, value in self.policy.items():
            print(json.loads(key)['action'])
        print('-------------------------')

    def _make_key(self, screen_bow: List, action_bow: set) -> str:
        """Make a normalized string key for dict storage."""
        return json.dumps(
            {"screen": [(t, x1, y1, x2, y2) for (t, x1, y1, x2, y2) in screen_bow],
             "action": list(action_bow)},
            sort_keys=True,
        )

    def _load_from_disk(self):
        if os.path.exists(self.cache_file):
            with open(self.cache_file, "r") as f:
                data = json.load(f)
                for key, value in data.items():
                    self.policy.put(key, value)

    def _save_to_disk(self):
        with open(self.cache_file, "w") as f:
            json.dump(dict(self.policy.items()), f, indent=2)

    def query_cache(self, action_bow):
        """Fetch screen XML, build bows, check cache for hit or miss."""
        xml_str = fetch_ui_xml()
        screen_bow = parse_ui_xml(xml_str)
        #action_bow = CacheSimilarity.build_action_bow(action, screen_bow)
        print(f'\n\naction_bow - {action_bow}')
        self.printCache()

        # Compare with existing entries
        for key, value in self.policy.items():
            entry = value
            if CacheSimilarity.is_similar(
                screen_bow, set(action_bow), entry["screen_bow"], set(entry["action_bow"])
            ):
                # hit
                print('Cache hit !!!!!')
                self.policy.get(key)  # mark as recently used
                self._save_to_disk()
                return value["low_level_instructions"], entry["screen_bow"]

        # miss
        print('Cache miss !!!!!')
        return None, screen_bow 

    def add_entry(self, screen_bow, action_bow, low_level_execution_instructions):
        """Add entry to cache, evicting LRU if needed."""
        if len(action_bow) == 0:
            return
        key = self._make_key(screen_bow, action_bow)
        value = {
            "screen_bow": screen_bow,
            "action_bow": list(action_bow),
            "low_level_instructions": low_level_execution_instructions,
        }
        self.policy.put(key, value)
        self._save_to_disk()

lru_cache = PersistentActionCache('lru_cache.json', capacity=50, policy='lru')

"""
# ------------------- Example Usage -------------------
if __name__ == "__main__":
    cache = PersistentActionCache("action_cache.json", capacity=10, policy="lru")

    # Example query
    action = "Click on email field"
    hit, screen_bow, action_bow = cache.query_cache(action)
    if hit:
        print("Cache HIT:", hit)
    else:
        print("Cache MISS, adding entry...")
        cache.add_entry(screen_bow, action_bow, low_level_execution_instructions=["adb", "tap", "100", "200"])
"""
