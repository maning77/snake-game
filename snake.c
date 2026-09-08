#include <stdio.h>
#include <conio.h>
#include <windows.h>
#include <stdlib.h>
#include <time.h>

#define W 22
#define H 22

int x[200], y[200];
int foodX, foodY;
int len = 3, dir = 1, over = 0;

//判断坐标是否落在蛇身上（含蛇头）
int onSnake(int px, int py){
    for(int i=0;i<len;i++)
        if(x[i]==px && y[i]==py) return 1;
    return 0;
}

//生成食物（避开蛇身，避免刷在蛇身上）
void randFood(){
    do{
        foodX = rand()%(W-2)+1;
        foodY = rand()%(H-2)+1;
    }while(onSnake(foodX, foodY));
}

//初始化蛇
void init(){
    srand((unsigned)time(NULL));
    x[0]=W/2; y[0]=H/2;
    x[1]=W/2-1; y[1]=H/2;
    x[2]=W/2-2; y[2]=H/2;
    randFood();
}

//绘制画面
void render(){
    system("cls");
    for(int i=0;i<H;i++){
        for(int j=0;j<W;j++){
            if(j==0||j==W-1||i==0||i==H-1){
                printf("#");
            }else if(j==x[0]&&i==y[0]){
                printf("@");//蛇头
            }else if(j==foodX&&i==foodY){
                printf("*");//食物
            }else{
                int body=0;
                for(int k=1;k<len;k++){
                    if(x[k]==j&&y[k]==i){
                        printf("o");
                        body=1;
                        break;
                    }
                }
                if(!body) printf(" ");
            }
        }
        putchar('\n');
    }
    printf("分数：%d | X键退出\n",len-3);
}

//键盘监听
void keyInput(){
    if(_kbhit()){
        int ch = _getch();
        //方向键为两字节序列：前缀 0xE0 或 0，后跟扩展键码
        if(ch==0xE0 || ch==0) ch = _getch();
        switch(ch){
            case 72: if(dir!=2) dir=0; break; //上
            case 80: if(dir!=0) dir=2; break; //下
            case 75: if(dir!=1) dir=3; break; //左
            case 77: if(dir!=3) dir=1; break; //右
            case 'x': case 'X': over=1; break;
        }
    }
}

//游戏核心逻辑
void gameLogic(){
    //身体后移
    int px = x[0], py = y[0];
    if(dir==0) y[0]--;
    if(dir==2) y[0]++;
    if(dir==1) x[0]++;
    if(dir==3) x[0]--;

    for(int i=1;i<len;i++){
        int tx=x[i], ty=y[i];
        x[i]=px; y[i]=py;
        px=tx; py=ty;
    }

    //撞墙
    if(x[0]<=0||x[0]>=W-1||y[0]<=0||y[0]>=H-1) over=1;
    //撞到自身
    for(int i=1;i<len;i++)
        if(x[0]==x[i]&&y[0]==y[i]) over=1;
    //吃到食物
    if(x[0]==foodX&&y[0]==foodY){
        len++;
        randFood();
    }
}

int main(){
    init();
    while(!over){
        render();
        keyInput();
        gameLogic();
        Sleep(130); //数值越小速度越快
    }
    printf("\n游戏结束！");
    return 0;
}