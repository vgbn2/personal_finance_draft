#include <stdio.h>
int main(){
    int a,b;scanf("%d%d",&a,&b);
    for(int i=0;i<a;i++){
        if(i>0)
        for(int k=1;k<=i;k++){
            printf("~");
        }
        for(int j=0;j<b;j++){
            printf("*");
        }
        printf("\n");
    }
}