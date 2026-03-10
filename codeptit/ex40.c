#include <stdio.h>
int main(){
    int a;scanf("%d",&a);
    for(int i=a;i>0;i--){
        for(int k=i-1;k>0;k--){
            printf("~");
        }
        for(int j=0;j<a;j++){
            printf("*");
        }
        printf("\n");
    }
}