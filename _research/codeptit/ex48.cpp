#include <stdio.h>

int main(){
int a,b;
scanf("%d %d",&a,&b);
for(int i=1;i<=a;i++){
   /* for(int j=i;j<=b;j++){
        printf("%d",j);//tạo tam giác ngược 1234/234/34/44
    }*/
    if(i>1)
    for(int k=1;k<i;k++){
        if(a<=b)
        printf("%d",i-k);//tạo tam giác xuôi
      
    }
    printf("\n");
}
}