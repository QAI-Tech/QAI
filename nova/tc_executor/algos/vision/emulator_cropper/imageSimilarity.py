from skimage.metrics import structural_similarity as ssim
import os, sys, json
import cv2

def hardCodedCrop(ss, x=36, y=100, w=650, h=1400):
    cropped_image = ss[y:y+h, x:x+w]
    return cropped_image

def getSim(dirpath):
    print('Processing dirpath:', dirpath)
    image1_path, image2_path = os.listdir(dirpath)
    image1 = cv2.imread(os.path.join(dirpath, image1_path), cv2.IMREAD_GRAYSCALE)
    image2 = cv2.imread(os.path.join(dirpath, image2_path), cv2.IMREAD_GRAYSCALE)

    image1 = hardCodedCrop(image1)
    image2 = hardCodedCrop(image2)
    if image1.shape != image2.shape:
        image2 = cv2.resize(image2, (image1.shape[1], image1.shape[0]))

    similarity_index, _ = ssim(image1, image2, full=True)
    return similarity_index

if __name__ == '__main__':
    mm_1_easy = './images/cache/mismatch_1_easy'
    mm_2_hard = './images/cache/mismatch_2_hard'
    mm_3_hard = './images/cache/mismatch_3_hard'
    mm_4_hard = './images/cache/mismatch_4_hard'
    m_1_hard = './images/cache/match_1_hard'

    print(getSim(mm_1_easy))
    print(getSim(mm_2_hard))
    print(getSim(mm_3_hard))
    print(getSim(mm_4_hard))
    print(getSim(m_1_hard))
