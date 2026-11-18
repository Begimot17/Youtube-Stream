from bs4 import BeautifulSoup

if __name__ == '__main__':
    with open('jutsu.html','r',encoding='utf-8') as f :
        html = f.read()
        soup = BeautifulSoup(html)
        for name in soup.select('.aaname'):
            print(name.text)