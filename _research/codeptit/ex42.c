#include <stdio.h>
int main(){
    int a;scanf("%d",&a);
    int o=a;
    for(int i=1;i<=a;i++){
        for(int k=o-1;k>0;k--){
            printf("~");
        }
        for(int j=1;j<=a;j++){
           if(i>1&&j>1&&i<a&&j<a) printf(".");
           else printf("*");
        }
        o--;
        printf("\n");
    }
}