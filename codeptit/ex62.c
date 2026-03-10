#include <stdio.h>
int ucln(int a,int b){
while(b!=0){
    int c=a%b;
    a=b;
    b=c;
}
return a;
}
int main(){
    int a,b;scanf("%d%d",&a,&b);
    for(int i=a;i<=b;i++){
        for(int j=a;j<=b;j++){
            if(ucln(i,j)==1&&i<j)
        printf("(%d,%d)\n",i,j);
        }
    }
}