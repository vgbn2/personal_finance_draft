#include <stdio.h>
#include <ctype.h>
#include <string.h>
void rev(char ar[]){
    char sx[505];int n=strlen(sx);
    for(int i=0;i<n/2;i++){
        char t=sx[i];
        sx[i]=sx[n-1-i];
        sx[n-1-i]=t;
    }
    
}
void cong(char ar[],char br[]){
    int n=strlen(ar),m=strlen(br),nho=0;
    rev(ar),rev(br);
    strcat(ar,"0");char tong[505];
    for(int i=0;i<n-m;i++)strcat(br,"0");
    for(int i=0;i<n;i++){
        int x=ar[i]-'0';
        int y=br[i]-'0';
        int t=x+y+nho;
        t=t%10;
        tong[i]=t+'0';
    }
    if (tong[n]=='0')tong[n]='\0';
    rev(tong);
}
int main(){
    char ar[505],br[505];
    if(strlen(ar)>strlen(br))
    cong(ar,br);
    else cong(br,ar);
}