#include <stdio.h>
#include <math.h>
#include <string.h>

int main(){
    char s[20];scanf("%s", &s);
    int co[10]={0};
    for(int i=0;i<strlen(s);i++){
        int x=s[i]-'0';
        if(x==2||x==3||x==5||x==7)
        co[x]++;
    }
    for(int i=0;i<strlen(s);i++){
        int x=s[i]-'0';
       if(co[x]>0){
        printf("%d %d\n",x,co[x]);
        co[x]=0;
       }
    }
}