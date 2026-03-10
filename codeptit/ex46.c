#include <stdio.h>
int main(){
    int a;scanf("%d",&a);
    int o=a;
    for(int i=1;i<=a;i++){
        for(int j=o;j>1;j--){
            printf("~");
        }
        for(int k=1;k<=i;k++){
            printf("*");
        }
        o--;
        printf("\n");
    }
}