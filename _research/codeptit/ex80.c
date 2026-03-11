#include <stdio.h>
int ucln(int a,int b){
    while(b!=0){
        int temp=b;
        b=a%b;
        a=temp;
    }
    return a;
}
int main(){
    int t;scanf("%d",&t);
    for(int i=0;i<t;i++){
        int a,b,c,d;scanf("%d%d%d%d",&a,&b,&c,&d);
        if(ucln(a,b)==ucln(c,d))printf("YES\n");
        else printf("NO\n");

    }
}