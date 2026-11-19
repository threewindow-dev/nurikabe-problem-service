import type { Puzzle } from '@core';

export const hardSamples: Puzzle[] = [
  {
    "id": "p-10x15-hard-0",
    "title": "Nurikabe hard #0",
    "difficulty": "hard",
    "definition": {
      "width": 10,
      "height": 15,
      "clues": [
        [5,null,null,null,null,null,1,null,2,null],
        [null,null,null,null,null,null,null,null,null,null],
        [null,null,1,null,1,null,null,null,1,null],
        [3,null,null,1,null,null,null,null,null,null],
        [null,null,1,null,1,null,null,null,null,3],
        [null,null,null,null,null,null,null,null,null,null],
        [5,null,null,null,null,null,5,null,null,2],
        [null,null,null,null,null,null,null,null,null,null],
        [3,null,4,null,1,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,9],
        [null,null,null,null,1,null,null,null,1,null],
        [null,null,null,null,null,null,null,null,null,null],
        [1,null,null,null,3,null,null,null,null,2],
        [null,null,null,null,null,null,null,null,null,null],
        [1,null,null,null,3,null,1,null,1,null]
      ]
    },
    "solution": {
      "width": 10,
      "height": 15,
      "colors": [
        ["white","white","white","white","white","black","white","black","white","white"],
        ["black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","black","white","black","white","black","white","black"],
        ["white","black","black","white","black","black","white","black","black","white"],
        ["white","black","white","black","white","black","white","black","white","white"],
        ["black","black","black","black","black","black","white","black","black","black"],
        ["white","white","white","white","white","black","white","black","white","white"],
        ["black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","black","white","black","white","white","white","white"],
        ["white","black","white","white","black","black","white","black","black","white"],
        ["white","black","white","black","white","black","white","black","white","black"],
        ["black","black","black","black","black","black","white","black","black","black"],
        ["white","black","white","white","white","black","white","black","white","white"],
        ["black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","white","white","black","white","black","white","black"]
      ]
    }
  },
  {
    "id": "p-12x18-hard-0",
    "title": "Nurikabe hard #0",
    "difficulty": "hard",
    "definition": {
      "width": 12,
      "height": 18,
      "clues": [
        [5,null,null,null,null,null,1,null,3,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null],
        [null,null,1,null,5,null,null,null,4,null,1,null],
        [3,null,null,1,null,null,null,null,null,null,null,null],
        [null,null,5,null,1,null,null,null,null,null,1,null],
        [null,null,null,null,null,null,null,null,null,null,null,null],
        [1,null,null,null,null,null,null,null,6,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null],
        [null,null,7,null,1,null,null,null,1,null,1,null],
        [null,null,null,1,null,null,null,null,null,1,null,null],
        [null,null,1,null,7,null,null,null,1,null,1,null],
        [null,null,null,null,null,null,null,null,null,null,null,null],
        [null,null,null,null,3,null,1,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null],
        [3,null,1,null,1,null,3,null,5,null,2,null],
        [null,null,null,1,null,null,null,null,null,4,null,null],
        [null,null,1,null,1,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null]
      ]
    },
    "solution": {
      "width": 12,
      "height": 18,
      "colors": [
        ["white","white","white","white","white","black","white","black","white","white","white","black"],
        ["black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","black","white","white","white","black","white","black","white","black"],
        ["white","black","black","white","black","black","white","black","white","white","black","black"],
        ["white","black","white","black","white","black","white","black","white","black","white","black"],
        ["black","black","white","black","black","black","black","black","black","black","black","white"],
        ["white","black","white","white","white","black","white","black","white","white","white","white"],
        ["black","black","black","black","black","black","white","black","black","black","black","white"],
        ["white","white","white","black","white","black","white","black","white","black","white","black"],
        ["white","black","black","white","black","black","white","black","black","white","black","black"],
        ["white","black","white","black","white","white","white","black","white","black","white","black"],
        ["white","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","white","white","black","white","black","white","white","white","black"],
        ["black","black","black","black","black","black","black","black","white","black","black","black"],
        ["white","black","white","black","white","black","white","black","white","black","white","white"],
        ["white","black","black","white","black","black","white","black","black","white","black","black"],
        ["white","black","white","black","white","black","white","black","white","white","white","black"],
        ["black","black","black","black","black","black","black","black","black","black","black","black"]
      ]
    }
  },
  {
    "id": "p-14x21-hard-0",
    "title": "Nurikabe hard #0",
    "difficulty": "hard",
    "definition": {
      "width": 14,
      "height": 21,
      "clues": [
        [1,null,1,null,5,null,1,null,1,null,5,null,1,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [1,null,1,null,null,null,null,null,1,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [5,null,null,null,1,null,null,null,3,null,1,null,null,null],
        [null,null,null,null,null,null,4,null,null,null,null,4,null,null],
        [3,null,null,null,1,null,null,null,null,null,1,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [5,null,null,null,1,null,7,null,null,null,5,null,1,null],
        [null,null,null,null,null,1,null,null,null,null,null,1,null,null],
        [3,null,null,null,1,null,7,null,null,null,1,null,2,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,null,1,null,null,3,null,null,1,null,3,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [1,null,null,null,null,null,1,null,null,null,1,null,1,null],
        [null,null,null,null,null,1,null,null,null,null,null,1,null,null],
        [7,null,null,null,1,null,1,null,3,null,5,null,1,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [3,null,null,null,3,null,null,null,1,null,null,null,null,null]
      ]
    },
    "solution": {
      "width": 14,
      "height": 21,
      "colors": [
        ["white","black","white","black","white","black","white","black","white","black","white","black","white","black"],
        ["black","black","black","black","white","black","black","black","black","black","white","black","black","black"],
        ["white","black","white","black","white","white","white","black","white","black","white","white","white","black"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","white","white","black","white","black","white","black","white","black","white","black","white","black"],
        ["black","black","white","black","black","white","white","black","white","black","black","white","white","black"],
        ["white","black","white","black","white","black","white","black","white","black","white","black","white","black"],
        ["white","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","white","white","white","white","black","white","black","white","white","white","black"],
        ["black","black","black","black","black","black","white","black","white","black","white","black","black","black"],
        ["white","white","white","black","white","black","white","black","white","black","white","black","white","black"],
        ["black","black","white","black","black","white","black","black","white","black","black","white","black","black"],
        ["white","black","white","black","white","black","white","white","white","black","white","black","white","white"],
        ["white","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","black","white","white","white","black","white","black","white","white","white","black"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","black","white","white","white","black","white","black","white","black","white","black","white","black"],
        ["black","black","white","black","black","white","black","black","white","black","black","white","black","black"],
        ["white","white","white","black","white","black","white","black","white","black","white","black","white","black"],
        ["black","black","black","black","black","black","black","black","black","black","white","black","black","black"],
        ["white","white","white","black","white","white","white","black","white","black","white","white","white","black"]
      ]
    }
  },
  {
    "id": "p-16x24-hard-0",
    "title": "Nurikabe hard #0",
    "difficulty": "hard",
    "definition": {
      "width": 16,
      "height": 24,
      "clues": [
        [1,null,null,null,null,null,null,null,null,2,null,null,1,null,null,null],
        [null,1,null,2,null,3,null,1,null,null,null,1,null,1,null,2],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [2,null,null,1,null,3,null,null,null,1,null,3,null,null,null,1],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,1,null,null,null,null,null,null,null,null,null,5,null,null,null,null],
        [1,null,null,3,null,null,4,null,null,null,null,null,null,null,null,null],
        [null,1,null,null,null,5,null,1,null,null,null,1,null,4,null,3],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [4,null,null,null,null,null,null,null,null,1,null,null,3,null,null,1],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,3],
        [3,null,null,null,null,null,4,null,null,null,null,null,4,null,null,null],
        [null,5,null,null,null,1,null,1,null,3,null,1,null,13,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,2,null,1,null,3,null,null,null,1,null,null,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,1,null,null,null,1,null,null,null,3,null,1,null,1,null,null],
        [1,null,null,null,null,null,null,4,null,null,null,null,1,null,null,null],
        [null,1,null,null,null,7,null,null,null,null,null,1,null,null,null,null],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,2,null,null,null,null,null,3,null,1,null,null,3,null,null,1],
        [null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null],
        [null,1,null,1,null,null,null,3,null,1,null,1,null,1,null,1]
      ]
    },
    "solution": {
      "width": 16,
      "height": 24,
      "colors": [
        ["white","black","black","white","black","white","white","black","black","white","black","black","white","black","black","white"],
        ["black","white","black","white","black","white","black","white","black","white","black","white","black","white","black","white"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","white","black","white","black","white","white","white","black","white","black","white","white","white","black","white"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["black","white","black","white","black","white","white","white","black","white","white","white","black","white","black","white"],
        ["white","black","black","white","black","black","white","black","black","white","black","black","white","white","black","white"],
        ["black","white","black","white","black","white","black","white","black","white","black","white","black","white","black","white"],
        ["black","black","black","black","black","white","black","black","black","black","black","black","black","black","black","black"],
        ["white","white","white","white","black","white","white","white","black","white","black","white","white","white","black","white"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","white","black","white","black","white","white","white","black","white","black","white","white","white","black","white"],
        ["white","black","black","white","black","black","white","black","black","white","black","black","white","black","black","white"],
        ["black","white","white","white","black","white","black","white","black","white","black","white","black","white","black","white"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","white","black","black"],
        ["white","white","black","white","black","white","white","white","black","white","black","white","white","white","white","white"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","black","black","white"],
        ["black","white","black","white","black","white","black","white","black","white","black","white","black","white","black","white"],
        ["white","black","black","white","black","black","white","white","black","white","black","black","white","black","black","white"],
        ["black","white","black","white","white","white","black","white","black","white","black","white","black","white","white","white"],
        ["black","black","black","white","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["white","white","black","white","black","white","white","white","black","white","black","white","white","white","black","white"],
        ["black","black","black","black","black","black","black","black","black","black","black","black","black","black","black","black"],
        ["black","white","black","white","black","white","white","white","black","white","black","white","black","white","black","white"]
      ]
    }
  }
];
